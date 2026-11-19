import { describe, expect, it } from 'vitest'
import { strFromU8 } from 'fflate'
import twoFiles from './__fixtures__/two-files.tar.b64?raw'
import { bytesOf } from './__fixtures__/bytes'
import { readTar } from './tar'

describe('readTar', () => {
  it('reads the files of a tar made by GNU tar', () => {
    const files = readTar(bytesOf(twoFiles))
    expect([...files.keys()]).toEqual(['schema.sql', 'counts-before.txt'])
    expect(strFromU8(files.get('counts-before.txt')!)).toBe('people|1\ndocs|3\nlocations|1\nsettings|1\n')
    expect(strFromU8(files.get('schema.sql')!)).toBe('-- synthetic schema, for the tests\n')
  })
})
