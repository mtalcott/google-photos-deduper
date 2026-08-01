const required = 22
const actual = parseInt(process.versions.node.split(".")[0], 10)

if (actual < required) {
  console.error(
    `\nUnsupported Node version: ${process.version} (need >=${required}.x.x)\n` +
    `Run 'nvm use' to switch to the version pinned in .nvmrc.\n`
  )
  process.exit(1)
}
