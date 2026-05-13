# Catalyst Monthly Cost Estimate — 150 Daily Active Users

> **Date:** 2026-05-13 (revised — calibrated against actual May 1–13 billing data)
> **Source pricing:** Zoho Catalyst pricing page + real billing console (May 1–13)
> **Currency:** All figures in INR (₹). Account is on the Indian DC (INR billing).
> **Minimum billing:** ₹300 / month (confirmed).
> **Catalyst Cache (Dev env) hard limits:** 20 segments / project · 5 MB per segment · 16,000 chars per cache item · 500 chars per key · 1,000 GETs / month free tier.
> Our CacheService enforces the per-item and per-key limits client-side so
> oversized writes are skipped cleanly with a log line (the app never breaks
> if a cache item is too big — it just re-fetches from the DB next request).
> **Scope:** Functions, API Gateway, Web Client Hosting, Mail, Push Notifications,
> Search, Stratus, Data Store, Cache, DevOps, LLM (QuickML / Zia LLM).

This doc translates Catalyst's per-call pricing into a monthly budget for our
app at the target scale of **150 daily active users (DAU)**, calibrated against
real billing data from the first half of May.

---

## 🚨 Reality check — actual billing console data (May 1–13, 33 platform users)

The billing console for **May 1 → May 13** shows total spend of **₹809.53** for
**33 users** on the platform. Breakdown:

| Service | Volume | Cost | % of bill |
|---|---|---|---|
| **Data Store — Fetch (Select)** | 220,190 | **₹792.68** | **97.9%** |
| Functions (256 MB × 22,600 s) | 5,650 GB-s | ₹5.42 | 0.7% |
| Data Store — Insert | 775 | ₹4.65 | 0.6% |
| Data Store — Update | 646 | ₹3.10 | 0.4% |
| API Gateway | 23,647 | ₹1.42 | 0.2% |
| Mail | 226 | ₹1.36 | 0.2% |
| LLM Input (24,273 tokens) | 24K | ₹0.29 | 0.04% |
| LLM Output (8,952 tokens) | 9K | ₹0.21 | 0.03% |
| Web Client | 4,926 | ₹0.12 | 0.01% |
| Cache (19 Put + 12 Update — **no Gets billed**) | 31 | ₹0.11 | 0.01% |
| Stratus (uploads + downloads) | 2,378 | ₹0.08 | 0.01% |
| Push Notifications | 30 | ₹0.04 | 0.005% |
| Data Store — Delete | 5 | ₹0.02 | 0.002% |
| Search | 5 | ₹0.01 | 0.001% |
| Data Store — Storage (0.075 GB-days) | — | ₹0.003 | 0.0004% |
| **TOTAL** | | **₹809.53** | **100%** |

### Key findings vs estimates

| Finding | Implication |
|---|---|
| **Data Store Fetch = 98% of bill** | Far more dominant than estimated (was 61%). |
| **Cache shows 0 Gets billed, only 31 Puts/Updates total in 13 days** | **🚨 The `authCtx` cache implementation is not effectively running in production.** No DB queries are being short-circuited. We are paying the full uncached price right now. |
| **LLM tokens were ~50× lower than estimated** | Voice/EOD AI features see very low real usage. ₹0.50 spent on LLM in 13 days. |
| **Mail billed at ₹0.006 / email, not ₹0.06** | 10× cheaper than the public pricing page shows. Worth confirming this rate persists. |
| **9.3 DataStore fetches per API call** (220K / 23.6K) | Higher than my "6 per request" assumption. AuthMiddleware + downstream queries combined. |
| **55 API calls per user per day** (vs 100 estimated) | Real usage is ~half my estimate. Per-user cost is lower than projected. |

### Extrapolation to 150 DAU monthly

Scaling factor: `(150 users / 33 users) × (30 days / 13 days) = 10.49×`

| Scenario | Monthly cost at 150 DAU |
|---|---|
| **Today (cache not effective)** | **₹8,492** — linear extrapolation of real billing |
| **If cache deployment is fixed** (Fetch drops ~75% per design) | **₹2,500–₹3,000** |
| Theoretical no-cache, no-optimization | ~₹11,200 (matches my §3A estimate) |
| Minimum billing floor | ₹300 / month (we're already above this) |

**The single most impactful thing to verify right now: why are there no Cache
Gets in the billing?** Either:
- The cache code path isn't being hit (deployment issue, env var, SDK init failing silently)
- Cache GETs are below a free-tier threshold that doesn't show in billable (possible but unusual — they should appear with ₹0 cost)
- `CacheService.get()` is throwing and silently returning null (the wrapper swallows errors by design)

Once the cache is working, the Data Store Fetch line — which is **98% of
the bill** — should drop dramatically.

---

## 1. Usage assumptions vs reality (now calibrated)

> ⚠️ **Earlier version of this doc was wrong by 60×.** The first cut used scraped
> rates that turned out to be off by two decimal places. The figures below use
> the official "Per Component Charges" table directly.

---

## 1. Usage assumptions (the inputs that drive everything)

| Variable | Calibrated value | Source / rationale |
|---|---|---|
| Daily active users (DAU) | **150** | Stated requirement |
| API calls per user per day | **55** | **Calibrated from May 1–13 billing**: 23,647 calls / 33 users / 13 days |
| DataStore fetches per API call | **9.3** | **Calibrated**: 220,190 / 23,647. (AuthMiddleware + downstream queries.) |
| Page loads per user per day | 20 | Sidebar / dashboard / individual feature pages |
| Concurrent peak | ~30 users | ~20% of DAU online at once during business hours |
| Active hours per user | 8 | Working day |
| Tenants | 1 active | Single org currently |
| Email notifications fired | ~80/day | **Calibrated**: 226 / 33 / 13 = 0.53/user/day × 150 |
| Push notifications | ~10/day | **Calibrated**: 30 / 13 = 2.3/day current → scaled |
| File uploads | ~33/day | **Calibrated**: 95 / 13 = 7.3/day current → scaled to 150 DAU |
| File downloads | ~800/day | **Calibrated**: 2,283 / 13 = 175/day current → scaled |
| Search queries | ~2/day | **Calibrated**: 5 / 13 ≈ 0.4/day current → scaled |
| **LLM calls** | **~10/day** | **Calibrated**: actual is much lower than feared. LLM input ~1,870 tokens/day × 150/33 ≈ 8.5K tokens/day. Token-heavy calls are rare. |
| LLM input tokens/month | ~340K | **Calibrated**: 24,273 × 10.49 (scaling factor) |
| LLM output tokens/month | ~125K | **Calibrated**: 8,952 × 10.49 |

**Derived totals per month (30 days) — calibrated from real data:**
- 55 calls/user/day × 150 × 30 ≈ **247,500 API calls / month** (revised down from 450K)
- 9.3 fetches/call × 247,500 ≈ **2,302,000 selects / month** (uncached) — close to the 2.7M in the previous estimate
- ~340K LLM input tokens + ~125K LLM output tokens / month — **~50× smaller than first estimate**
- ~2,370 emails / month (revised down from 3,000)
- ~830 file uploads / month + ~24,000 downloads / month
- ~315 push notifications / month

---

## 2. Catalyst pricing snapshot (Per Component Charges)

All rates are **per request, no free tier baked into these figures**. Free-tier
quotas, if applicable to the chosen plan, would offset the first N calls of
each line item — but the public per-component pricing page does not show
those offsets, so we cost the full volume here.

### Functions / Serverless
| Op | Rate |
|---|---|
| Functions | ₹0.00096 / GB-second |
| Circuits | ₹0.0012 / state transition |
| AppSail | ₹4.8 / GB-hour |

### Backend
| Op | Rate |
|---|---|
| API Gateway | ₹0.00006 / request |
| Web Client Hosting | ₹0.000024 / request |
| Mail | ₹0.06 / email |
| Push Notifications | ₹0.0012 / notification |
| Search | ₹0.0024 / query |

### Stratus (File Storage)
| Op | Rate |
|---|---|
| File Download | ₹0.000024 / request |
| File Upload | ₹0.0003 / request |
| File Update | ₹0.0003 / request |
| File Storage | ₹1.2 / GB |

### Data Store
| Op | Rate |
|---|---|
| Select | ₹0.0036 / request |
| Insert | ₹0.006 / request |
| Update | ₹0.0048 / request |
| Delete | ₹0.0048 / request |
| Storage | ₹1.2 / GB |

### Cache
| Op | Rate |
|---|---|
| GET | ₹0.0024 / request |
| PUT | ₹0.0036 / request |
| UPDATE | ₹0.0036 / request |

### DevOps
| Op | Rate |
|---|---|
| APM | ₹0.0012 / request |
| Automation Testing | ₹0.3 / request |
| Application Alerts | ₹0.03 / alert |

### AI / ML (LLM via QuickML)
| Op | Rate |
|---|---|
| LLM Input Tokens | ₹12 / million tokens |
| LLM Output Tokens | ₹24 / million tokens |
| VLM Input Tokens | ₹48 / million tokens |
| VLM Output Tokens | ₹72 / million tokens |
| Single Prediction | ₹0.03 / call |
| Model Inference (0–25K) | ₹0.15 / call |
| Model Inference (25K–1L) | ₹0.12 / call |
| Model Inference (>1L) | ₹0.06 / call |

The app uses LLM (text) only — voice → transcript → LLM. VLM (vision) is not
used currently.

---

## 3. Monthly cost breakdown at 150 DAU (calibrated)

### A. Today's state — cache not effective (linear extrapolation of real billing)

This is what we'd actually pay if usage stays as it is and cache is not fixed.

| Service | Volume | Rate | Monthly |
|---|---|---|---|
| **Data Store — Fetch** | 2,310,000 | ₹0.0036 | **₹8,316.00** |
| Data Store — Insert | ~8,130 | ₹0.006 | ₹48.79 |
| Data Store — Update | ~6,777 | ₹0.0048 | ₹32.53 |
| Data Store — Delete | ~52 | ₹0.0048 | ₹0.25 |
| Data Store — Storage (~0.075 GB-days × 30) | — | ₹0.0432 | ₹0.03 |
| Functions (256 MB × ~237K seconds) | 59,250 GB-s | ₹0.00096 | ₹56.88 |
| API Gateway | 247,500 | ₹0.00006 | ₹14.85 |
| Web Client Hosting | 51,668 | ₹0.000024 | ₹1.24 |
| Stratus — Uploads | ~996 | ₹0.0003 | ₹0.30 |
| Stratus — Downloads | ~23,946 | ₹0.000024 | ₹0.57 |
| Mail (**billed rate ₹0.006**) | ~2,370 | ₹0.006 | ₹14.22 |
| Push Notifications | ~315 | ₹0.0012 | ₹0.38 |
| Search | ~52 | ₹0.0024 | ₹0.13 |
| Cache (Put + Update — barely used) | ~325 | ₹0.0036 | ₹1.17 |
| **LLM — Input tokens** | ~340,000 | ₹12/M | ₹4.08 |
| **LLM — Output tokens** | ~125,000 | ₹24/M | ₹3.00 |
| **TOTAL** | | | **~₹8,492 / month** |

Sanity check: ₹809.53 × 10.49 = ₹8,492 — matches.

**98% of this bill is Data Store Fetch.** Everything else is rounding error.

### B. If the cache is properly fixed and working

The unified `authCtx:v1:{userId}` cache replaces ~5 of every ~6 auth-time
DB selects with 1 cache hit. The `modules:{tenantId}` cache replaces 1 DB
select per page load with 1 cache hit. Net effect: Data Store Fetch volume
drops ~70–75% (some downstream queries aren't cached).

| Service | Volume change | Rate | Monthly |
|---|---|---|---|
| **Data Store — Fetch** | 2.31M → ~600K (75% drop from cached auth + module reads) | ₹0.0036 | **₹2,160.00** |
| Data Store — Insert / Update / Delete | unchanged | — | ₹81.57 |
| Data Store — Storage | unchanged | — | ₹0.03 |
| **Cache — GET** (1/req auth + 1/page-load module) | ~297,000 | ₹0.0024 | **₹712.80** |
| **Cache — PUT** (~1/miss, ~10% miss rate) | ~25,000 | ₹0.0036 | ₹90.00 |
| Functions | unchanged | — | ₹56.88 |
| API Gateway + Web + Stratus + Push + Search | unchanged | — | ₹17.47 |
| Mail | unchanged | — | ₹14.22 |
| LLM Input + Output | unchanged | — | ₹7.08 |
| **TOTAL** | | | **~₹3,140 / month** |

That's a **saving of ~₹5,352 / month (~63%)** vs today's state — IF the cache
gets fixed.

### C. Comparison

| Scenario | Monthly (INR) | Notes |
|---|---|---|
| **Today (cache not effective)** | **₹8,492** | Linear extrapolation of May 1–13 billing |
| **Cache properly fixed** | **₹3,140** | Target state |
| Cache fixed + AuthMiddleware cache deployed to other 10 services | **~₹2,000** | After Phase 2 optimizations |
| Account minimum billing floor | **₹300** | We're well above this at any realistic scale |

The cache fix is **₹5,352/month worth** at 150 DAU — and that scales linearly
with users.

---

## 4. Sensitivity — what happens if usage grows

Linear scaling from the May 1–13 actuals.

| Scale | Today (cache not effective) | If cache is fixed | Saving from cache fix |
|---|---|---|---|
| 33 users / 13 days (actual) | ₹809 | (could be ~₹300) | ~₹500 |
| 50 DAU / month | ~₹2,830 | ~₹1,050 | ₹1,780 |
| **150 DAU / month** (target) | **₹8,492** | **₹3,140** | **₹5,352** |
| 500 DAU / month | ~₹28,300 | ~₹10,500 | ₹17,800 |
| 1,500 DAU / month | ~₹84,900 | ~₹31,400 | ₹53,500 |

The **₹300 / month minimum billing** is only relevant at very low usage —
we'd cross it organically around **5–10 DAU**. At every scale shown above
we pay actual usage, not the floor.

---

## 5. Per-service breakdown at 150 DAU

### Today's state (extrapolated from real billing)

```
Data Store — Fetch                                    ₹8,316   (97.9%)
Functions                                              ₹  57   ( 0.7%)
Data Store — Insert / Update / Delete                  ₹  82   ( 1.0%)
API Gateway                                            ₹  15   ( 0.2%)
Mail                                                   ₹  14   ( 0.2%)
LLM (Input + Output)                                   ₹   7   ( 0.1%)
Everything else                                        ₹   1   ( 0.0%)
                                                       -------
                                                       ₹8,492 /mo
```

### Target state (cache properly working)

```
Data Store — Fetch                                    ₹2,160   (68.8%)
Cache (Get + Put)                                      ₹  803   (25.6%)
Data Store — Insert / Update / Delete                  ₹  82   ( 2.6%)
Functions                                              ₹  57   ( 1.8%)
API Gateway                                            ₹  15   ( 0.5%)
Mail                                                   ₹  14   ( 0.4%)
LLM (Input + Output)                                   ₹   7   ( 0.2%)
Everything else                                        ₹   1   ( 0.0%)
                                                       -------
                                                       ₹3,140 /mo
```

Cache + Data Store stay the dominant pair, but the absolute number drops
by 63%. **LLM and Mail are insignificant at current usage levels** —
each well under ₹20/month.

---

## 6. Where to optimize further (ranked by cost-saving potential at 150 DAU)

| Priority | Optimization | Est. saving / month at 150 DAU |
|---|---|---|
| **0** | **🚨 Make the existing cache actually work** — diagnose why no Cache Gets appear in billing. Verify `CacheService` is instantiated, `req.catalystApp` is propagated correctly, and SDK init doesn't throw silently. | **₹5,352** |
| 1 | Replicate `authCtx` cache in the other 10 services' AuthMiddleware | ₹1,000–₹1,500 |
| 2 | Cache project membership lookups (`project_members`) | ₹200–₹400 |
| 3 | Cache tenant settings JSON | ₹100–₹200 |
| 4 | Audit the 9.3 DataStore fetches per API call — find which endpoints fan out the most | ₹500+ |
| 5 | Disable / sample DevOps APM tracing if enabled | up to ₹300 |
| 6 | LLM: tighten prompts, cap output tokens | ₹2–₹5 (insignificant at current usage) |

Priority 0 is by far the biggest lever — **fixing cache is worth ~₹5,300/month
right now** with no code changes (the wrapper is already deployed).

The second biggest lever is the **AuthMiddleware duplication across 11 services**.
Each service has its own copy. We've only cache-enabled one
(`delivery_sync_function`). If/when the others see significant traffic, they
each contribute another full-uncached cost.

---

## 7. Minimum billing — ₹300 / month

Confirmed: the account on Indian DC has a **₹300 / month minimum billing** floor.
This means:

- If actual usage is below ₹300, the bill is ₹300.
- If actual usage is ≥ ₹300, we pay the actual usage.

At every scale considered in this doc we're already **well above the floor**:

| Scale | Actual cost | Above ₹300 floor? |
|---|---|---|
| 33 users / 13 days (actual May 1–13) | ₹809 | yes (already 2.7× the floor) |
| 50 DAU / month | ~₹2,830 | yes (9.4×) |
| **150 DAU / month** | **₹8,492** (today) / **₹3,140** (cache fixed) | yes (10–28×) |
| 1,500 DAU / month | ~₹84.9K / ~₹31.4K | yes (100×+) |

The floor would only kick in if we had **fewer than ~5 users** on the
platform. At normal operating scale the floor is irrelevant — every rupee
of optimization translates 1:1 to a lower bill.

---

## 8. Recommended action plan

1. **🚨 Diagnose why the cache shows 0 Gets in the billing console.** This is
   the single highest-leverage action. Check: is `CacheService.get()` actually
   being called in `AuthMiddleware`? Is the wrapper swallowing init errors?
   Is the SDK throwing on `cache().getCacheInstance()`? **Worth ~₹5,300/mo
   the moment it's fixed.**
2. **Minimum billing already confirmed: ₹300/month** (Indian DC). We're above
   the floor at any realistic scale, so all optimization translates 1:1 to bill
   reduction.
3. **Confirm Mail rate** — billed at ₹0.006/email, not ₹0.06 as shown on the
   pricing page. Is this a promotional rate? Will it persist?
4. **Set up Catalyst billing dashboard alerts** at ₹1,000, ₹3,000, ₹5,000
   monthly thresholds.
5. **Audit the 9.3 fetches per API call** — find which endpoints fan out
   the most. Likely candidates: dashboard, sprint board, project listing.
6. **Apply Phase 2 cache optimizations** (the table in §6) once cache base
   is working.
7. **Re-run this estimate quarterly** as the user base and features evolve.

---

## 9. Summary

| Question | Answer |
|---|---|
| Actual billing May 1–13 (33 users) | **₹809.53** |
| Linear extrapolation to 150 DAU, cache as-is today | **₹8,492 / month** |
| Target state at 150 DAU (cache properly working) | **₹3,140 / month** |
| After Phase 2 optimizations (cache in all 11 services) | **~₹2,000 / month** |
| Saving if cache is fixed | **~₹5,352 / ~63%** |
| Minimum billing floor | **₹300 / month** (we're 10–28× above this — floor is irrelevant) |
| LLM contribution to bill | **~₹7 / 0.1% of total** (much smaller than feared) |
| Largest cost driver today | **Data Store Fetch (98% of bill)** — cache is not reducing it |
| Critical open question 1 | **Why does the billing show 0 cache Gets?** Cache code may not be active in production. |
| Critical open question 2 | Why is Mail billed at ₹0.006 vs ₹0.06 on the pricing page? |

---

## 10. Final number — total monthly INR

**At 150 DAU, projecting today's actual usage pattern forward:**

# ₹ 8,492 / month — current trajectory (cache not effective)
# ₹ 3,140 / month — target state (cache fixed)
# ₹ 2,000 / month — after Phase 2 cache rollout to all 11 services

For reference:
- Actual May 1–13 spend (33 users, 13 days): **₹ 809.53**
- Account minimum billing: **₹ 300 / month** (already exceeded — irrelevant)

Breakdown of the ₹ 8,492 today-trajectory number:
- Data Store Fetch: ₹ 8,316 (98.0%)
- Data Store writes: ₹ 82 (1.0%)
- Functions: ₹ 57 (0.7%)
- API Gateway + Mail + everything else: ₹ 37 (0.4%)
- LLM: ₹ 7 (0.1%)

**Per-request economics confirmed:** It is **9× cheaper to serve a cached
auth context** (1 cache get @ ₹0.0024) than to re-resolve from the DB
(6 selects @ ₹0.0036 = ₹0.0216). The real billing confirms this — without
cache effectively running we're paying full price on every auth flow.
**Fixing the cache deployment is worth ₹ 5,352 / month at 150 DAU** and
scales linearly with users.
