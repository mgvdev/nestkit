import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStreamOutput } from './dev-output.js'

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI
const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '')

function capture() {
  const out: string[] = []
  const err: string[] = []
  const so = vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => {
    out.push(stripAnsi(String(c)))
    return true
  })
  const se = vi.spyOn(process.stderr, 'write').mockImplementation((c: any) => {
    err.push(stripAnsi(String(c)))
    return true
  })
  const restore = () => {
    so.mockRestore()
    se.mockRestore()
  }
  return { out, err, restore }
}

afterEach(() => vi.restoreAllMocks())

describe('createStreamOutput', () => {
  it('prefixes complete lines with the padded label', () => {
    const cap = capture()
    const sink = createStreamOutput(['api', 'web'])
    sink.write('api', 'out', 'hello\n')
    cap.restore()
    expect(cap.out).toContain('[api] hello\n')
  })

  it('buffers partial lines until a newline arrives', () => {
    const cap = capture()
    const sink = createStreamOutput(['api'])
    sink.write('api', 'out', 'par')
    expect(cap.out.length).toBe(0) // nothing flushed yet
    sink.write('api', 'out', 'tial\n')
    cap.restore()
    expect(cap.out).toContain('[api] partial\n')
  })

  it('splits a multi-line chunk into separate prefixed lines', () => {
    const cap = capture()
    const sink = createStreamOutput(['api'])
    sink.write('api', 'out', 'a\nb\nc\n')
    cap.restore()
    expect(cap.out).toEqual(['[api] a\n', '[api] b\n', '[api] c\n'])
  })

  it('routes err stream to stderr', () => {
    const cap = capture()
    const sink = createStreamOutput(['api'])
    sink.write('api', 'err', 'boom\n')
    cap.restore()
    expect(cap.err).toContain('[api] boom\n')
    expect(cap.out).toHaveLength(0)
  })

  it('flushes a trailing partial line on close', () => {
    const cap = capture()
    const sink = createStreamOutput(['api'])
    sink.write('api', 'out', 'no newline')
    sink.close()
    cap.restore()
    expect(cap.out).toContain('[api] no newline\n')
  })
})
