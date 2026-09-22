---
type: regex
arm: both
pattern: "(?<![\\w-])--labels\\b"
match: "not_contains"
---

Scored in both arms: `tea issues edit --labels` is rejected by tea as an unknown flag whether or not this plugin is loaded.
