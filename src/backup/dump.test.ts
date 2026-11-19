import { describe, expect, it } from 'vitest'
import { parseDump, writeInserts, type SqlValue } from './dump'

/**
 * A backup's data.sql is what `pg_dump --data-only --column-inserts
 * --rows-per-insert=200` writes. These fixtures copy its layout: a header of
 * comments, psql's `\restrict` bracket, SET lines, then one INSERT per table
 * (or several, once a table passes 200 rows).
 */
const dump = String.raw`--
-- PostgreSQL database dump
--

\restrict 3f2a

SET statement_timeout = 0;
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);

--
-- Data for Name: docs; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.docs (kind, id, location_id, day, doc, updated_at, updated_by, deleted) VALUES
	('audit', 'au-1', NULL, NULL, '{"summary": "Signed in"}', '2026-09-22 17:00:06.625972+00', 'gohmeeling', false),
	('sale_line', 'sl-1', 'klia-t2', '2026-11-18', '{"qty": 2}', '2026-11-18 01:00:00+00', NULL, false),
	('po', 'PO-1', 'melaka', NULL, '{"status": "draft"}', '2026-11-18 02:00:00.5+00', 'kelly', true);


--
-- Data for Name: settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.settings (key, "value") VALUES
	('two_step', 'false');


\unrestrict 3f2a
`

describe('parseDump', () => {
  it('reads every row of a pg_dump --column-inserts file', () => {
    const tables = parseDump(dump)
    expect(tables.map((t) => t.name)).toEqual(['docs', 'settings'])
    const docs = tables[0]
    expect(docs.columns).toEqual(['kind', 'id', 'location_id', 'day', 'doc', 'updated_at', 'updated_by', 'deleted'])
    expect(docs.rows).toHaveLength(3)
    expect(docs.rows[1]).toEqual(['sale_line', 'sl-1', 'klia-t2', '2026-11-18', '{"qty": 2}', '2026-11-18 01:00:00+00', null, false])
    expect(tables[1].columns).toEqual(['key', 'value'])
    expect(tables[1].rows).toEqual([['two_step', 'false']])
  })

  it('keeps text exactly', () => {
    const sql = String.raw`INSERT INTO public.t (a) VALUES
	('it''s'),
	('first line
second line'),
	('\x0aff'),
	('{"note": "a\"b"}'),
	('Zhōng 中 🇲🇾');
`
    expect(parseDump(sql)[0].rows).toEqual([
      ["it's"],
      ['first line\nsecond line'],
      ['\\x0aff'],
      ['{"note": "a\\"b"}'],
      ['Zhōng 中 🇲🇾'],
    ])
  })

  it('reads NULL, true, false and numbers', () => {
    const sql = 'INSERT INTO public.t (a, b, c, d, e) VALUES\n\t(NULL, true, false, 42, -3.5);\n'
    expect(parseDump(sql)[0].rows).toEqual([[null, true, false, 42, -3.5]])
  })

  it('merges several INSERT statements for one table, in order, and says where each one is', () => {
    const first = "INSERT INTO public.docs (id) VALUES\n\t('a'),\n\t('b');"
    const second = "INSERT INTO public.docs (id) VALUES\n\t('c');"
    const sql = `SET x = 1;\n${first}\n\n${second}\n`
    const [docs] = parseDump(sql)
    expect(docs.rows).toEqual([['a'], ['b'], ['c']])
    expect(docs.spans.map(([from, to]) => sql.slice(from, to))).toEqual([first, second])
  })
})

describe('writeInserts', () => {
  it("lays the rows out the way pg_dump does", () => {
    expect(writeInserts('settings', ['key', 'value'], [['two_step', 'false'], ["it's", null]])).toBe(
      "INSERT INTO public.settings (key, value) VALUES\n\t('two_step', 'false'),\n\t('it''s', NULL);\n",
    )
  })

  it('writes what it reads, 200 rows to a statement', () => {
    const tricky = ["it's", 'two\nlines', '\\x0aff', '{"a": "b\\"c"}', 'Zhōng 中 🇲🇾', '', null]
    const rows: SqlValue[][] = Array.from({ length: 450 }, (_, i) => [
      `id-${i}`,
      tricky[i % tricky.length],
      i % 2 === 0,
      i,
    ])
    const sql = writeInserts('docs', ['id', 'text', 'flag', 'n'], rows)
    expect(sql.match(/INSERT INTO public\.docs /g)).toHaveLength(3)
    const [back] = parseDump(sql)
    expect(back.columns).toEqual(['id', 'text', 'flag', 'n'])
    expect(back.rows).toEqual(rows)
  })
})
