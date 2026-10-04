# DishDeals status — Oct4 05:33 Vancouver
Release: integration6c69d94 = origin; production host live; installed app reported by William; new combined gate running.
| Feature | Evidence state | Owner |
| Core Reel→review/pin/publish/map | NOT STARTED live acceptance; local implementation exists | Loom/Mica/William |
| Login persistence | NOT STARTED phone verification | Prism/William |
| Discover canonical feed | BROKEN live; legacy query missing | Cinder (queued after core) |
| Manual pin / geocoding | NOT STARTED phone check / geocoding OFF pending real contact | Mica/William |
| 10 real seeds +2profiles | NOT STARTED live; data/profile validation pending | Prism (queued step5) |
| Secondary features | NOT STARTED live acceptance; existing branches parked | assigned after core |
Feedback: regional release validator rejects working endpoint; Cinder owns fix, target05:55; Android timing flake parked, isolated rerun if gate fails.
Next phone test (<5m): sign in/up, set name; SavedReels→Map→Profile; close/reopen and check still signed in. No agent accounts/signin.
William: perform login on installed app; production redeploy commands will be supplied from a clean reviewed snapshot. Geocoder needs real contact before enablement.
NOT READY: no observed iPhone Reel→confirmed published marker/detail or persistent login evidence.
