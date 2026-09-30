# Account deletion OTA — 2026-09-30

Published to the production channel for iOS only. The fix prefers linked Apple/Google verification over email-password verification, permits Apple accounts without an email, and preserves same-account verification before destructive operations.

Validation: seven provider-selection regression tests and fifteen tests of the real deletion-screen handler with simulated device/auth/backend responses. TypeScript checks and iOS Hermes exports passed in each release tree. Each served production manifest was checked against its update ID and the SHA-256 of the locally exported bundle. No live account was deleted, and physical-device OAuth was not tested.

Native compatibility: the newest and 1.12–1.14 runtime hashes match their production runtime. The 1.15.1 tree preserves its existing runtime pin. For 1.15, EAS fingerprint comparison against the previous published update found only the runtimeVersion config difference; restoring the same pin preserves that publication configuration. No native source or dependency change is part of this fix. Existing Watch/widget baseline warnings also occur in the original release trees; their native sources were not changed.

| iOS releases | Runtime | Update group | Release commit |
| --- | --- | --- | --- |
| 1.15.2 | `9a1023a42c401226abc2f1b812ed2aaa25161c2e` | `c02ef953-6327-46fe-be3e-fae7c0ed50d6` | `f0d8af93c9d51ce5030f0ce4ee995205d8ba3b35` |
| 1.15.1 | `7491078882380c20f349986ca0e812678399b818` | `f5e290ba-5e17-4679-b7f9-3d1240020b4a` | `0fc10d2d4f2eb25bba3eacfe77a68ec485ee8788` |
| 1.15 | `bdc3c6827e46178d46a7af30ed8b96c3611e9b6a` | `fe4f3e7e-ff68-4991-bce8-1a0257785fdd` | `b6501f86def414b5a02763e58c6d057a3fb85b1a` |
| 1.12–1.14 | `e88b984571db9c0ff2cf0b48850881cd84bc0e09` | `8b75aaf2-73ee-44d1-ab81-6c2df42a32a4` | `c2a93a00e33defbfaaf5680da230743210d983b0` |

Android and web were not deployed. Browser Apple redirect continuation remains outside this native release; the client prevents a redirect initiation from counting as completed verification.
