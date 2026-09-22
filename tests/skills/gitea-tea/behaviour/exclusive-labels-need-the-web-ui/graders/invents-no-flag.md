---
type: regex
arm: both
pattern: "--exclusive"
match: "not_contains"
---

Scored in both arms: a run that hands the user `tea labels create --exclusive` has invented a flag, and that is wrong with or without the plugin loaded.
