// Renders the two README stat cards as static SVGs, so the profile does not
// depend on github-readme-stats.vercel.app (its shared instance is paused).
// Output goes to dist/, which the workflow publishes to the `output` branch.

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const USER = process.env.GITHUB_USER
const TOKEN = process.env.GITHUB_TOKEN
const OUT = process.env.OUT_DIR ?? "dist"

// tokyonight, matching the theme the cards used before
const THEME = {
  bg: "#1a1b27",
  border: "#2a2b3d",
  title: "#70a5fd",
  text: "#38bdae",
  icon: "#bf91f3",
}

// @primer/octicons, 16px
const ICONS = {
  star: '<path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"/>',
  commit: '<path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>',
  pr: '<path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>',
  issue: '<path d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>',
  repo: '<path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>',
}

const QUERY = `
query($login: String!) {
  user(login: $login) {
    name
    login
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
    }
    repositoriesContributedTo(first: 1, contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY]) {
      totalCount
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
  }
}`

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const num = (n) => n.toLocaleString("en-US")
const css = `text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Ubuntu, "Helvetica Neue", sans-serif; }
    .title { font-size: 18px; font-weight: 600; fill: ${THEME.title}; }
    .label { font-size: 14px; fill: ${THEME.text}; }`

async function fetchStats() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      authorization: `bearer ${TOKEN}`,
      "content-type": "application/json",
      "user-agent": "loyaniu-profile-cards",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  const body = await res.json()
  if (body.errors) throw new Error(`GraphQL: ${JSON.stringify(body.errors)}`)
  if (!body.data?.user) throw new Error(`no such user: ${USER}`)
  return body.data.user
}

function statsCard(user) {
  const stars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0)
  const commits =
    user.contributionsCollection.totalCommitContributions +
    user.contributionsCollection.restrictedContributionsCount

  const rows = [
    ["star", "Total Stars Earned", stars],
    ["commit", `Total Commits (last year)`, commits],
    ["pr", "Total PRs", user.pullRequests.totalCount],
    ["issue", "Total Issues", user.issues.totalCount],
    ["repo", "Contributed to (last year)", user.repositoriesContributedTo.totalCount],
  ]

  const W = 450
  const H = 56 + rows.length * 26
  const name = esc(user.name ?? user.login)
  const body = rows
    .map(([icon, label, value], i) => `  <g transform="translate(25 ${50 + i * 26})">
    <g fill="${THEME.icon}" transform="scale(0.875)">${ICONS[icon]}</g>
    <text class="label" x="28" y="12">${esc(label)}</text>
    <text class="label value" x="${W - 50}" y="12">${num(value)}</text>
  </g>`)
    .join("\n")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}'s GitHub stats">
  <style>
    ${css}
    .value { font-weight: 700; text-anchor: end; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <text class="title" x="25" y="34">${name}'s GitHub Stats</text>
${body}
</svg>
`
}

function langsCard(user, limit = 6) {
  const totals = new Map()
  for (const repo of user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const entry = totals.get(node.name) ?? { size: 0, color: node.color ?? "#858585" }
      entry.size += size
      totals.set(node.name, entry)
    }
  }
  const all = [...totals].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.size - a.size)
  const total = all.reduce((sum, l) => sum + l.size, 0) || 1
  const top = all.slice(0, limit).map((l) => ({ ...l, pct: (l.size / total) * 100 }))

  const W = 340
  const PAD = 25
  const BAR_W = W - PAD * 2
  const BAR_Y = 50
  const ROW_H = 22
  const rows = Math.ceil(top.length / 2)
  const H = BAR_Y + 8 + 20 + rows * ROW_H

  let offset = 0
  const segments = top
    .map((l) => {
      const w = (l.pct / 100) * BAR_W
      const seg = `    <rect x="${(PAD + offset).toFixed(2)}" y="${BAR_Y}" width="${w.toFixed(2)}" height="8" fill="${esc(l.color)}"/>`
      offset += w
      return seg
    })
    .join("\n")

  const legend = top
    .map((l, i) => {
      const x = PAD + (i % 2) * (BAR_W / 2)
      const y = BAR_Y + 28 + Math.floor(i / 2) * ROW_H
      return `  <g transform="translate(${x.toFixed(2)} ${y})">
    <circle cx="5" cy="8" r="5" fill="${esc(l.color)}"/>
    <text class="label" x="16" y="12">${esc(l.name)} ${l.pct.toFixed(2)}%</text>
  </g>`
    })
    .join("\n")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Most used languages">
  <style>
    ${css}
    .label { font-size: 12px; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${THEME.bg}" stroke="${THEME.border}"/>
  <text class="title" x="${PAD}" y="34">Most Used Languages</text>
  <mask id="bar"><rect x="${PAD}" y="${BAR_Y}" width="${BAR_W}" height="8" rx="4" fill="#fff"/></mask>
  <g mask="url(#bar)">
${segments}
  </g>
${legend}
</svg>
`
}

if (!USER) throw new Error("GITHUB_USER is not set")
if (!TOKEN) throw new Error("GITHUB_TOKEN is not set")

const user = await fetchStats()
await mkdir(OUT, { recursive: true })
await writeFile(join(OUT, "github-stats.svg"), statsCard(user))
await writeFile(join(OUT, "github-top-langs.svg"), langsCard(user))
console.log(`wrote ${OUT}/github-stats.svg and ${OUT}/github-top-langs.svg for ${USER}`)
