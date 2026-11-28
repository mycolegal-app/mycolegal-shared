"use client";

// Editor de texto con CodeMirror 6 para las plantillas DocFilling de las apps (LegiFirma, Pólizas…). Sustituye al
// <textarea> de `DocFillingTemplateEditor` (27-nov-2026, PLAN_TECNICO_PLANTILLAS_DOCFILLING_APPS):
//   · resalta las directivas `{{…}}` por clase: campo, dato de la notaría (SYSTEM:), condición/lista (IF, FOR
//     EACH…), formato (WORD_STYLE, PAGEBREAK, ABORT) y subcampo de lista (ITEM.X);
//   · numera las líneas y marca las que tienen diagnósticos (el mensaje sale al pasar el ratón);
//   · `insertar()` escribe en el cursor e `irALinea()` lleva a un diagnóstico.
//
// Es deliberadamente LIGERO. El editor de esquemas de Redactor (mycolegal-redactor/src/components/codigo) entiende
// la sintaxis entera del motor (INCLUDE, DECLARE, plegado…); estas plantillas usan un subconjunto acotado (D1) y
// la validación de verdad la hace el servidor con el motor. Aquí no se importa `docfilling-core`: `ui` no lo
// necesita para pintar.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";

export interface DiagnosticoEditor {
  line: number;
  col: number;
  severity: string;
  message: string;
}

export interface DocFillingCodeEditorHandle {
  /** Escribe `texto` en el cursor (sustituye la selección) y deja el cursor detrás. */
  insertar(texto: string): void;
  /** Lleva el cursor a la línea y columna (desde 1) y la hace visible. */
  irALinea(line: number, col?: number): void;
  focus(): void;
}

export interface DocFillingCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaLabel?: string;
  diagnosticos?: DiagnosticoEditor[] | null;
  className?: string;
}

// -----------------------------------------------------------------------------
// Resaltado de directivas
// -----------------------------------------------------------------------------

const DIRECTIVA = /\{\{[^{}\n]*\}\}/g;

function claseDe(directiva: string): string {
  const d = directiva.slice(2, -2).trim().toUpperCase();
  if (/^(IF|ELSE|ENDIF|FOR\s+EACH|ENDFOR)\b/.test(d)) return "cm-df-control";
  if (d.startsWith("SYSTEM:")) return "cm-df-notaria";
  if (/^(WORD_STYLE|PAGEBREAK|ABORT|BLOQUEO)\b/.test(d)) return "cm-df-formato";
  if (d.startsWith("ITEM.")) return "cm-df-item";
  return "cm-df-campo";
}

const marcas = new Map<string, Decoration>();
function marca(clase: string): Decoration {
  let m = marcas.get(clase);
  if (!m) marcas.set(clase, (m = Decoration.mark({ class: `cm-df ${clase}` })));
  return m;
}

function decorar(view: EditorView): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const texto = view.state.doc.sliceString(from, to);
    for (const m of texto.matchAll(DIRECTIVA)) {
      const ini = from + (m.index ?? 0);
      b.add(ini, ini + m[0].length, marca(claseDe(m[0])));
    }
  }
  return b.finish();
}

const resaltado = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = decorar(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = decorar(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// -----------------------------------------------------------------------------
// Diagnósticos: la línea se marca y el mensaje sale de título
// -----------------------------------------------------------------------------

const ponerDiagnosticos = StateEffect.define<DiagnosticoEditor[]>();

const campoDiagnosticos = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    let s = set.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(ponerDiagnosticos)) continue;
      const porLinea = new Map<number, DiagnosticoEditor[]>();
      for (const d of e.value) {
        if (d.line < 1 || d.line > tr.state.doc.lines) continue;
        porLinea.set(d.line, [...(porLinea.get(d.line) ?? []), d]);
      }
      const b = new RangeSetBuilder<Decoration>();
      for (const n of [...porLinea.keys()].sort((a, c) => a - c)) {
        const ds = porLinea.get(n)!;
        const error = ds.some((d) => d.severity === "error");
        b.add(
          tr.state.doc.line(n).from,
          tr.state.doc.line(n).from,
          Decoration.line({
            class: error ? "cm-df-linea-error" : "cm-df-linea-aviso",
            attributes: { title: ds.map((d) => d.message).join("\n") },
          }),
        );
      }
      s = b.finish();
    }
    return s;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// -----------------------------------------------------------------------------
// Tema: colores translúcidos, legibles en claro y en oscuro
// -----------------------------------------------------------------------------

const tema = EditorView.theme({
  "&": { fontSize: "12px", minHeight: "420px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: "1.6" },
  ".cm-content": { padding: "8px 0", minHeight: "420px" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "rgb(148 163 184)" },
  ".cm-activeLine": { backgroundColor: "rgba(100, 116, 139, 0.06)" },
  ".cm-df": { borderRadius: "3px", padding: "0 1px" },
  ".cm-df-campo": { backgroundColor: "rgba(14, 165, 233, 0.14)", color: "rgb(3 105 161)" },
  ".cm-df-item": { backgroundColor: "rgba(14, 165, 233, 0.08)", color: "rgb(3 105 161)" },
  ".cm-df-notaria": { backgroundColor: "rgba(16, 185, 129, 0.14)", color: "rgb(4 120 87)" },
  ".cm-df-control": { backgroundColor: "rgba(139, 92, 246, 0.14)", color: "rgb(109 40 217)", fontWeight: "600" },
  ".cm-df-formato": { backgroundColor: "rgba(245, 158, 11, 0.16)", color: "rgb(180 83 9)" },
  ".cm-df-linea-error": { backgroundColor: "rgba(239, 68, 68, 0.10)", boxShadow: "inset 3px 0 0 rgb(239 68 68)" },
  ".cm-df-linea-aviso": { backgroundColor: "rgba(245, 158, 11, 0.10)", boxShadow: "inset 3px 0 0 rgb(245 158 11)" },
});

// -----------------------------------------------------------------------------
// Componente
// -----------------------------------------------------------------------------

export const DocFillingCodeEditor = forwardRef<DocFillingCodeEditorHandle, DocFillingCodeEditorProps>(
  function DocFillingCodeEditor({ value, onChange, readOnly = false, ariaLabel, diagnosticos, className }, ref) {
    const host = useRef<HTMLDivElement | null>(null);
    const vista = useRef<EditorView | null>(null);
    const alCambiar = useRef(onChange);
    alCambiar.current = onChange;
    const soloLectura = useRef(new Compartment());

    useEffect(() => {
      if (!host.current) return;
      const extensiones: Extension[] = [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        resaltado,
        campoDiagnosticos,
        tema,
        soloLectura.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel ?? "", spellcheck: "false" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) alCambiar.current(u.state.doc.toString());
        }),
      ];
      const v = new EditorView({ state: EditorState.create({ doc: value, extensions: extensiones }), parent: host.current });
      vista.current = v;
      return () => {
        v.destroy();
        vista.current = null;
      };
      // El editor se crea UNA vez; valor, sólo lectura y diagnósticos se sincronizan abajo.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // El valor cambia desde fuera (otra plantilla, «Descartar cambios»): se sustituye el documento entero.
    useEffect(() => {
      const v = vista.current;
      if (!v) return;
      const actual = v.state.doc.toString();
      if (actual !== value) v.dispatch({ changes: { from: 0, to: actual.length, insert: value } });
    }, [value]);

    useEffect(() => {
      vista.current?.dispatch({
        effects: soloLectura.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
      });
    }, [readOnly]);

    useEffect(() => {
      // Al editar, las marcas siguen a su línea (el StateField las mapea) hasta la próxima comprobación.
      vista.current?.dispatch({ effects: ponerDiagnosticos.of(diagnosticos ?? []) });
    }, [diagnosticos]);

    useImperativeHandle(ref, () => ({
      insertar(texto: string) {
        const v = vista.current;
        if (!v || readOnly) return;
        const { from, to } = v.state.selection.main;
        v.dispatch({ changes: { from, to, insert: texto }, selection: { anchor: from + texto.length }, scrollIntoView: true });
        v.focus();
      },
      irALinea(line: number, col = 1) {
        const v = vista.current;
        if (!v) return;
        const n = Math.min(Math.max(1, line), v.state.doc.lines);
        const l = v.state.doc.line(n);
        const pos = Math.min(l.from + Math.max(0, col - 1), l.to);
        v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        v.focus();
      },
      focus() {
        vista.current?.focus();
      },
    }), [readOnly]);

    return <div ref={host} className={className} />;
  },
);
