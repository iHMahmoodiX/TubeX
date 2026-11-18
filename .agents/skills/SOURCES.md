# Skill sources

Reviewed 2026-10-20. Markdown only; no scripts, hooks or executables were vendored.

| Local path | Upstream | Revision | Licence | Changes |
|---|---|---|---|---|
| `systematic-debugging/SKILL.md`, `root-cause-tracing.md` | https://github.com/obra/superpowers `skills/systematic-debugging/` | `bb92a77741419a4ab5f06e711a283343f1ada0c3` | MIT (Jesse Vincent), `LICENSE-superpowers` | None. References to other `superpowers:` skills map to the local folders here. |
| `test-driven-development/SKILL.md` | same repo, `skills/test-driven-development/` | same | MIT | None |
| `verification-before-completion/SKILL.md` | same repo, `skills/verification-before-completion/` | same | MIT | None |

Not vendored:
- `obra/superpowers` other skills (planning, subagents, worktrees): conflict with the one-agent, low-context workflow in AGENTS.md.
- `nextlevelbuilder/ui-ux-pro-max-skill` @ `56ea9cf174ed86786187daa9de0e6247cb0747e4` (MIT): about 30 MB with design datasets and Python search scripts; the brief forbids vendoring large datasets for startup. DESIGN.md carries the UX rules instead.
- Impeccable: no verified source located in this session.

Discovery: these files are plain Markdown routed from AGENTS.md. Claude Code does not auto-discover `.agents/skills/`; agents read them when AGENTS.md routes there.
