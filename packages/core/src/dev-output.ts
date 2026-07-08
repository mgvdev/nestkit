import { c } from './logger.js'

export type Stream = 'out' | 'err'

/** Control Sequence Introducer (ESC + '['). */
const CSI = '['

/** Multiplexes labeled output from several dev processes onto one console. */
export interface OutputSink {
  /** Write a chunk of a process's stdout/stderr. */
  write(label: string, stream: Stream, chunk: string): void
  /** Write a nestkit orchestration notice attributed to a label. */
  note(label: string, line: string): void
  /** Flush buffers and restore the terminal. */
  close(): void
}

const PALETTE: Array<(s: string) => string> = [c.cyan, c.green, c.yellow, c.magenta, c.blue, c.red]

/** Assign a stable color per label by declaration order. */
function colorMap(labels: string[]): Map<string, (s: string) => string> {
  const map = new Map<string, (s: string) => string>()
  labels.forEach((l, i) => map.set(l, PALETTE[i % PALETTE.length]!))
  return map
}

/** Split incoming chunks into complete lines, buffering partial tails. */
function lineBuffer(onLine: (line: string) => void) {
  let buf = ''
  return {
    push(chunk: string) {
      buf += chunk
      let i = buf.indexOf('\n')
      while (i >= 0) {
        onLine(buf.slice(0, i).replace(/\r$/, ''))
        buf = buf.slice(i + 1)
        i = buf.indexOf('\n')
      }
    },
    flush() {
      if (buf) {
        onLine(buf)
        buf = ''
      }
    },
  }
}

/** Default sink: prefixed, colored lines (concurrently / turbo style). */
export function createStreamOutput(labels: string[]): OutputSink {
  const width = Math.max(...labels.map((l) => l.length), 1)
  const colors = colorMap(labels)
  const buffers = new Map<string, ReturnType<typeof lineBuffer>>()

  const prefix = (label: string) => {
    const color = colors.get(label) ?? ((s: string) => s)
    return color(`[${label.padEnd(width)}]`)
  }

  const emit = (label: string, stream: Stream, line: string) => {
    const target = stream === 'err' ? process.stderr : process.stdout
    target.write(`${prefix(label)} ${line}\n`)
  }

  const bufferFor = (label: string, stream: Stream) => {
    const key = `${label} ${stream}`
    let b = buffers.get(key)
    if (!b) {
      b = lineBuffer((line) => emit(label, stream, line))
      buffers.set(key, b)
    }
    return b
  }

  return {
    write(label, stream, chunk) {
      bufferFor(label, stream).push(chunk)
    },
    note(label, line) {
      emit(label, 'out', c.dim(line))
    },
    close() {
      for (const b of buffers.values()) b.flush()
    },
  }
}

/**
 * Split-panes view (one scrolling region per process). TTY-only; when stdout is
 * not a TTY (piped, CI) it transparently falls back to the prefixed-line sink.
 */
export function createTuiOutput(labels: string[]): OutputSink {
  if (!process.stdout.isTTY) return createStreamOutput(labels)

  const colors = colorMap(labels)
  const history = new Map<string, string[]>(labels.map((l) => [l, []]))
  const CAP = 1000
  let dirty = false
  let scheduled = false

  const out = process.stdout
  const write = (s: string) => out.write(s)

  write(`${CSI}?1049h`) // alternate screen buffer
  write(`${CSI}?25l`) // hide cursor

  const render = () => {
    dirty = false
    const rows = out.rows ?? 24
    const cols = out.columns ?? 80
    const panes = labels.length
    const paneHeight = Math.max(2, Math.floor(rows / panes))
    let frame = `${CSI}H` // cursor home

    for (const label of labels) {
      const color = colors.get(label) ?? ((s: string) => s)
      const header = ` ${label} `
      const bar = '─'.repeat(Math.max(0, cols - header.length - 2))
      frame += `${color(`──${header}${bar}`)}${CSI}K\n`

      const body = history.get(label) ?? []
      const bodyHeight = paneHeight - 1
      const lines = body.slice(-bodyHeight)
      for (let i = 0; i < bodyHeight; i++) {
        frame += `${(lines[i] ?? '').slice(0, cols)}${CSI}K\n`
      }
    }
    frame += `${CSI}J` // clear below
    write(frame)
  }

  const schedule = () => {
    dirty = true
    if (scheduled) return
    scheduled = true
    setImmediate(() => {
      scheduled = false
      if (dirty) render()
    })
  }

  const push = (label: string, line: string) => {
    const buf = history.get(label)
    if (!buf) return
    buf.push(line)
    if (buf.length > CAP) buf.splice(0, buf.length - CAP)
    schedule()
  }

  const buffers = new Map<string, ReturnType<typeof lineBuffer>>()
  const bufferFor = (label: string, stream: Stream) => {
    const key = `${label} ${stream}`
    let b = buffers.get(key)
    if (!b) {
      b = lineBuffer((line) => push(label, line))
      buffers.set(key, b)
    }
    return b
  }

  const onResize = () => render()
  out.on('resize', onResize)
  render()

  return {
    write(label, stream, chunk) {
      bufferFor(label, stream).push(chunk)
    },
    note(label, line) {
      push(label, c.dim(line))
    },
    close() {
      for (const b of buffers.values()) b.flush()
      out.off('resize', onResize)
      write(`${CSI}?25h`) // show cursor
      write(`${CSI}?1049l`) // leave alternate screen
    },
  }
}

/** Pick the sink implementation based on the `--tui` flag. */
export function createOutput(labels: string[], tui: boolean): OutputSink {
  return tui ? createTuiOutput(labels) : createStreamOutput(labels)
}
