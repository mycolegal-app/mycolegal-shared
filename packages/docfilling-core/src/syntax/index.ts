// Capa de LENGUAJE: reconocer, clasificar y validar.
export { parseFields, classifyField, offsetToLineCol, FieldType } from './parser';
export type { ParsedField } from './parser';
export { pelarReqDoc, leerReq, leerDoc, quitarReqDoc } from './req-doc';
export type { ReqDecl, ReqDoc } from './req-doc';
export { validateText } from './validate';
export type { OpcionesValidacion } from './validate';
export { collectAllDeclares } from './validator';
export type { Diagnostic, DiagnosticFix, ValidationResult, IncludeResolver } from './validator';
export { TIPOS_CANONICOS, SINONIMOS_DE_TIPO, tipoAceptado, tipoCanonico } from './declare-types';
export type { TipoCanonico } from './declare-types';
export {
  PAGEBREAK, PAGEBREAK_HEREDADO, PAGEBREAK_DIRECTIVA, PAGEBREAK_PATTERN_G,
  esPageBreak, esPageBreakHeredado,
} from './page-break';
export { idiomaDePlantilla, IDIOMA_POR_DEFECTO } from './template-lang';
export { checkInputConOptions, checkIncludeConRuta } from './checks-pendientes';
export * from './constants';
