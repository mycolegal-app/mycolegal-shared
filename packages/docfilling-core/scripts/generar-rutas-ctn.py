#!/usr/bin/env python3
"""Regenera `src/iui/rutas-ctn.ts` desde el índice del XSD del CTN que mantiene el catálogo.

    python3 scripts/generar-rutas-ctn.py ../../../mycolegal-consultor/content/req-docs/iui/rutas.json

El índice (`iui/rutas.json`, de `iui/indice_xsd.py`) se genera desde los XSD IU2007. Aquí se copia
sin la documentación: el serializador sólo necesita el orden, la cardinalidad, las elecciones, los
códigos admitidos y el tipo base. Plan REQ_CATALOGO_IUI, F5.1.
"""
import json
import sys
from pathlib import Path

origen = Path(sys.argv[1])
d = json.loads(origen.read_text())
salida = {}
for ruta, v in d['rutas'].items():
    e = {'p': v['pos'], 'n': v.get('min', 0)}
    if v.get('max') is not None:
        e['x'] = v['max']
    if v.get('hoja'):
        e['h'] = 1
        if v.get('base'):
            e['b'] = v['base']
        if v.get('enumeracion'):
            e['e'] = v['enumeracion']
        if v.get('restricciones'):
            e['r'] = v['restricciones']
    if v.get('eleccion'):
        e['c'] = v['eleccion']
    salida[ruta] = e
destino = Path(__file__).resolve().parent.parent / 'src' / 'iui' / 'rutas-ctn.ts'
destino.write_text(
    '// GENERADO por scripts/generar-rutas-ctn.py desde el índice del XSD IU2007 del catálogo\n'
    f"// (iui/rutas.json, versión {d.get('version')}). No editar a mano.\n"
    '//\n'
    '// p = posición entre hermanos (xs:sequence), n/x = mínimo/máximo, h = hoja, b = tipo base,\n'
    '// e = códigos admitidos, r = restricciones del tipo (length, pattern, totalDigits…), c = xs:choice.\n'
    'export interface RutaCtn { p: number; n: number; x?: number; h?: 1; b?: string; e?: string[]; r?: Record<string, string>; c?: string }\n\n'
    f'export const RUTAS_CTN: Record<string, RutaCtn> = {json.dumps(salida, ensure_ascii=False, separators=(",", ":"))};\n'
)
print(f'{len(salida)} rutas → {destino}')
