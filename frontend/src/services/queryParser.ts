import type { MediaItem } from './api';

// ── Public type ────────────────────────────────────────────────────────────────

export interface ParsedQuery {
  /** Clean query text to send to the native service API (operators stripped) */
  nativeQuery: string;
  /** Client-side post-filter for returned results */
  matches: (item: MediaItem) => boolean;
  /** True when client-side filtering is required */
  hasFilters: boolean;
}

// ── String utilities ───────────────────────────────────────────────────────────

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ── AST nodes ─────────────────────────────────────────────────────────────────

type Node =
  | { t: 'and';    ch: Node[] }
  | { t: 'or';     ch: Node[] }
  | { t: 'not';    ch: Node }
  | { t: 'text';   v: string; exact: boolean }   // plain word or +word
  | { t: 'phrase'; v: string }                    // "quoted phrase"
  | { t: 'field';  name: string; v: string }      // Artist:value
  | { t: 'year';   min?: number; max?: number };  // Year:1990..2000

// ── Evaluator ─────────────────────────────────────────────────────────────────

function fields(item: MediaItem): string[] {
  return [item.title, item.artist, item.album ?? '', item.provider ?? ''].filter(Boolean);
}

function evalNode(n: Node, item: MediaItem): boolean {
  switch (n.t) {
    case 'and':    return n.ch.every(c => evalNode(c, item));
    case 'or':     return n.ch.some(c => evalNode(c, item));
    case 'not':    return !evalNode(n.ch, item);
    case 'text': {
      const check = n.exact
        ? (h: string) => h.includes(n.v)            // case+diacritic-sensitive
        : (h: string) => fold(h).includes(fold(n.v)); // accent-folded
      return fields(item).some(check);
    }
    case 'phrase':
      return fields(item).some(h => h.toLowerCase().includes(n.v.toLowerCase()));
    case 'field': {
      const val = (item as unknown as Record<string, unknown>)[n.name];
      return val != null && fold(String(val)).includes(fold(n.v));
    }
    case 'year': {
      if (item.year == null) return false;
      if (n.min != null && item.year < n.min) return false;
      if (n.max != null && item.year > n.max) return false;
      return true;
    }
  }
}

// ── Native-query extraction (strips operators, keeps positive text terms) ─────

function nativeText(n: Node): string {
  switch (n.t) {
    case 'and':    return n.ch.map(nativeText).filter(Boolean).join(' ');
    case 'or':     return n.ch.map(nativeText).filter(Boolean).join(' ');
    case 'not':    return '';                // excluded terms → not sent to API
    case 'text':   return n.v;
    case 'phrase': return `"${n.v}"`;
    case 'field':  return n.v;              // use field value as search term
    case 'year':   return '';               // year → post-filter only
  }
}

// ── Field-name mapping ────────────────────────────────────────────────────────

const FIELD_MAP: Record<string, keyof MediaItem> = {
  artist: 'artist', artists: 'artist', albumartist: 'artist',
  composer: 'artist', conductor: 'artist', director: 'artist',
  album: 'album', title: 'title',
  provider: 'provider', service: 'provider',
};

const YEAR_FIELDS = new Set(['year', 'origdate', 'originaldate']);

// ── Lexer ─────────────────────────────────────────────────────────────────────

type TKind = 'word' | 'exact' | 'phrase' | 'field_text' | 'field_year' | 'op_or' | 'op_not';

interface Tok {
  kind: TKind;
  v: string;
  fname?: string;    // field_text / field_year
  rmin?: number;     // field_year range min
  rmax?: number;     // field_year range max
}

function lex(input: string): Tok[] {
  const result: Tok[] = [];
  let i = 0;

  while (i < input.length) {
    if (/\s/.test(input[i])) { i++; continue; }

    // "quoted phrase"
    if (input[i] === '"') {
      const end = input.indexOf('"', i + 1);
      result.push({ kind: 'phrase', v: end === -1 ? input.slice(i + 1) : input.slice(i + 1, end) });
      i = end === -1 ? input.length : end + 1;
      continue;
    }

    // +exact (case+diacritic-sensitive)
    if (input[i] === '+' && i + 1 < input.length && !/\s/.test(input[i + 1])) {
      const s = ++i;
      while (i < input.length && !/\s/.test(input[i])) i++;
      result.push({ kind: 'exact', v: input.slice(s, i) });
      continue;
    }

    // -word (inline NOT, no space)
    if (input[i] === '-' && i + 1 < input.length && !/\s/.test(input[i + 1])) {
      const s = ++i;
      while (i < input.length && !/\s/.test(input[i])) i++;
      result.push({ kind: 'op_not', v: '' }, { kind: 'word', v: input.slice(s, i) });
      continue;
    }

    // Read until whitespace
    const s = i;
    while (i < input.length && !/\s/.test(input[i])) i++;
    const word = input.slice(s, i);
    const upper = word.toUpperCase();

    if (upper === 'OR' || word === ';') { result.push({ kind: 'op_or', v: 'OR' }); continue; }
    if (upper === 'NOT')               { result.push({ kind: 'op_not', v: '' }); continue; }
    if (upper === 'AND')               { continue; } // explicit AND = no-op (implicit)

    // Field:value  or  Year:X..Y
    const ci = word.indexOf(':');
    if (ci > 0) {
      const fname = word.slice(0, ci).toLowerCase();
      const fval  = word.slice(ci + 1);
      if (fval) {
        if (YEAR_FIELDS.has(fname)) {
          const rng = fval.match(/^(\d*)\.\.(\d*)$/);
          if (rng) {
            result.push({ kind: 'field_year', v: fval, fname: 'year',
              rmin: rng[1] ? +rng[1] : undefined,
              rmax: rng[2] ? +rng[2] : undefined });
          } else if (/^\d+$/.test(fval)) {
            const yr = +fval;
            result.push({ kind: 'field_year', v: fval, fname: 'year', rmin: yr, rmax: yr });
          } else {
            result.push({ kind: 'word', v: word });
          }
          continue;
        }
        const mapped = FIELD_MAP[fname];
        if (mapped) {
          result.push({ kind: 'field_text', v: fval, fname: String(mapped) });
          continue;
        }
      }
    }

    result.push({ kind: 'word', v: word });
  }

  return result;
}

// ── Parser ────────────────────────────────────────────────────────────────────
// Grammar — OR has higher precedence than AND (per Suchregeln.md):
//   query     = and_group*
//   and_group = [op_not] or_group
//   or_group  = atom (op_or atom)*
//   atom      = word | exact | phrase | field_text | field_year

function buildAst(tokens: Tok[]): Node {
  let pos = 0;

  function atom(): Node | null {
    if (pos >= tokens.length) return null;
    const tok = tokens[pos];
    if (tok.kind === 'op_or' || tok.kind === 'op_not') return null;
    pos++;
    switch (tok.kind) {
      case 'word':       return { t: 'text',   v: tok.v, exact: false };
      case 'exact':      return { t: 'text',   v: tok.v, exact: true };
      case 'phrase':     return { t: 'phrase', v: tok.v };
      case 'field_text': return { t: 'field',  name: tok.fname!, v: tok.v };
      case 'field_year': return { t: 'year',   min: tok.rmin, max: tok.rmax };
      default:           return null;
    }
  }

  function orGroup(): Node | null {
    let left = atom();
    if (!left) return null;
    while (pos < tokens.length && tokens[pos].kind === 'op_or') {
      pos++;
      const right = atom();
      if (!right) break;
      left = left.t === 'or'
        ? { t: 'or', ch: [...left.ch, right] }
        : { t: 'or', ch: [left, right] };
    }
    return left;
  }

  function andGroup(): Node | null {
    const negate = pos < tokens.length && tokens[pos].kind === 'op_not';
    if (negate) pos++;
    const g = orGroup();
    if (!g) return null;
    return negate ? { t: 'not', ch: g } : g;
  }

  const children: Node[] = [];
  while (pos < tokens.length) {
    const g = andGroup();
    if (g) children.push(g);
  }

  if (children.length === 0) return { t: 'text', v: '', exact: false };
  if (children.length === 1) return children[0];
  return { t: 'and', ch: children };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseQuery(input: string): ParsedQuery {
  const trimmed = input.trim();
  if (!trimmed) return { nativeQuery: '', matches: () => true, hasFilters: false };

  const tokens = lex(trimmed);
  if (tokens.length === 0) return { nativeQuery: trimmed, matches: () => true, hasFilters: false };

  const hasFilters = tokens.some(t =>
    t.kind === 'op_or' || t.kind === 'op_not' ||
    t.kind === 'phrase' || t.kind === 'exact' ||
    t.kind === 'field_text' || t.kind === 'field_year',
  );

  if (!hasFilters) {
    return { nativeQuery: trimmed, matches: () => true, hasFilters: false };
  }

  const ast  = buildAst(tokens);
  const native = nativeText(ast).replace(/\s+/g, ' ').trim() || trimmed;

  return {
    nativeQuery: native,
    matches: (item: MediaItem) => evalNode(ast, item),
    hasFilters: true,
  };
}
