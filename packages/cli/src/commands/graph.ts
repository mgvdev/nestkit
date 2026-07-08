import { c, loadWorkspaceGraph, logger, topoSort } from '@nestkit/core'
import { defineCommand } from 'citty'

export const graphCommand = defineCommand({
  meta: { name: 'graph', description: 'Print the project graph and build order.' },
  args: {
    json: { type: 'boolean', description: 'Output the graph as JSON.' },
  },
  run({ args }) {
    const { graph } = loadWorkspaceGraph(process.cwd())
    const { order, levels } = topoSort(graph)

    if (args.json) {
      const out = {
        order,
        levels,
        nodes: [...graph.nodes.values()].map((p) => ({
          name: p.name,
          type: p.type,
          managed: p.managed,
          compiler: p.compiler,
          localDeps: p.localDeps,
        })),
      }
      process.stdout.write(`${JSON.stringify(out, null, 2)}\n`)
      return
    }

    logger.info(`${graph.nodes.size} project(s), ${levels.length} build level(s):`)
    levels.forEach((level, i) => {
      logger.log(c.dim(`  level ${i}:`))
      for (const name of level) {
        const p = graph.nodes.get(name)!
        const tag = p.managed ? c.green(p.type ?? '?') : c.dim('unmanaged')
        const deps = p.localDeps.length ? c.dim(` → ${p.localDeps.join(', ')}`) : ''
        logger.log(`    ${c.bold(name)} ${tag}${deps}`)
      }
    })
  },
})
