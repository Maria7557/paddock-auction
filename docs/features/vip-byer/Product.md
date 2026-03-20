# Deterministic Functional Specification

## Feature: VIP Early Access for Newly Approved Vehicles

---

## 1. Feature definition

This feature introduces a temporary access-control phase named **VIP Early Access** for all vehicles newly approved after feature launch.

A vehicle’s business approval state remains **Approved** at the instant an admin approves it.

For the first 24 hours after approval timestamp, the vehicle is in a temporary access phase called **VIP Early Access**.

At the end of exactly 24 hours from approval timestamp, the VIP Early Access phase ends automatically and the vehicle becomes accessible to all buyers without manual intervention.

This feature does not introduce a new approval state, partial approval, pre-approval, admin override, manual release step, retroactive backfill, or notification logic.

---

## 2. Controlled vocabulary

### 2.1 Canonical business state

`Approved`

### 2.2 Temporary access phase label

`VIP Early Access`

### 2.3 Seller/admin displayed status during phase

`Approved – VIP Early Access`

### 2.4 Seller/admin displayed status after phase

`Approved`

### 2.5 Required regular-buyer teaser text

`Early access for VIP buyers`

### 2.6 Disallowed status language

The system must not display any of the following for this feature:

* `Pre-approved`
* `Approved with note`
* `Approved, public in 24h`

---

## 3. Actors

### 3.1 Admin

User who can approve a vehicle.

### 3.2 Seller

User who owns the vehicle listing.

### 3.3 VIP buyer

Buyer account meeting existing platform VIP eligibility rules. VIP eligibility rules are not defined by this feature; the system consumes existing VIP classification.

### 3.4 Regular buyer

Buyer account not classified as VIP.

### 3.5 Anonymous/non-authenticated user

Unauthenticated visitor. For this feature, anonymous users must be treated as regular buyers for visibility and access restrictions unless stricter existing platform rules already block them.

---

## 4. Inputs

### 4.1 Primary trigger event

`Admin clicks Approve on a vehicle`

### 4.2 Required input data at trigger time

* `vehicle_id`
* `admin_user_id`
* `approval_timestamp`
* current vehicle moderation decision context sufficient to mark listing approved under existing workflow
* current rollout eligibility for feature
* current buyer type classification logic available for later access evaluation

### 4.3 Runtime evaluation inputs

Whenever a vehicle is retrieved, ranked, rendered, or actioned, the system must evaluate:

* current timestamp
* `approval_timestamp`
* whether current user is VIP
* whether current user is seller of the vehicle
* whether current user is admin
* vehicle approval state
* rollout eligibility
* listing context:

  * browse/list context
  * search context
  * detail page access context
  * bid action context
  * buy now action context
  * watchlist action context
  * share action context

### 4.4 Derived input

`vip_early_access_active = true` if and only if:

* vehicle approval state is `Approved`
* feature rollout applies to this vehicle
* current timestamp is strictly earlier than `approval_timestamp + 24 hours`

### 4.5 Derived input after phase end

`vip_early_access_active = false` if:

* current timestamp is equal to or later than `approval_timestamp + 24 hours`
  or
* vehicle is not eligible for feature rollout
  or
* vehicle is not in approved state

---

## 5. Required persisted data behavior

This specification does not define schema design, but the system must have data sufficient to deterministically compute the feature.

### 5.1 Required durable data availability

The system must reliably retain:

* vehicle approval state
* approval timestamp for approved vehicle
* feature rollout applicability to post-launch approvals only

### 5.2 Approval timestamp write rule

At the moment admin approves the vehicle:

* approval timestamp must be set once to the exact approval instant used by business logic
* the 24-hour VIP Early Access period must be measured from that exact timestamp

### 5.3 Immutability rule

After approval succeeds:

* the approval timestamp used for VIP Early Access calculation must remain immutable for this feature
* the system must not recalculate the approval timestamp from later events
* the system must not shift the end time due to timezone conversions, date boundaries, daylight saving changes, or reindexing

### 5.4 Non-retroactivity rule

Vehicles approved before feature launch must not automatically enter VIP Early Access because of this feature rollout.

Pass condition:

* only vehicles whose approval event occurs after launch and within rollout scope are eligible

---

## 6. Functional rule: approval event

### 6.1 Trigger

Admin performs approve action on an approvable vehicle in existing moderation flow.

### 6.2 Required system outputs on successful approval

Immediately on success:

* vehicle business state becomes `Approved`
* vehicle enters VIP Early Access phase
* seller-facing status becomes `Approved – VIP Early Access`
* admin-facing status becomes `Approved – VIP Early Access`
* VIP buyers gain full normal buyer access
* regular buyers become restricted according to this specification
* phase end instant is deterministically `approval_timestamp + 24 hours`

### 6.3 User actions allowed at this step

Admin:

* can click Approve under existing approval permissions and validations

Admin cannot:

* choose whether VIP Early Access applies
* shorten duration
* extend duration
* skip duration
* manually end phase
* manually release to public

### 6.4 Validation

Blocking validations:

* vehicle must satisfy existing platform approval preconditions
* approval event must complete successfully
* approval timestamp must be recorded

Blocking error states:

* if approval persistence fails, vehicle must not partially enter approved state
* if approval timestamp cannot be recorded, approval action must fail atomically
* if feature eligibility cannot be determined at approval time, default behavior must still preserve successful approval; however visibility enforcement must fall back to deterministic safe behavior using stored approval timestamp if rollout says feature applies, otherwise no VIP phase

### 6.5 Propagation rules

On successful approval:

* all buyer-facing visibility gates for this vehicle must recompute using the new approval timestamp
* seller/admin displayed status must recompute immediately
* browse eligibility must recompute immediately
* detail accessibility must recompute immediately
* action permissions must recompute immediately
* VIP filter membership must recompute immediately
* regular search direct-discovery eligibility must recompute immediately
* ranking placement rules for teaser cards must recompute immediately where applicable

Immutable after approval:

* approval timestamp
* computed end instant (`approval_timestamp + 24 hours`)

### 6.6 Edge cases

* approval action double-submit by admin
* delayed UI refresh after approval
* cached list response generated just before approval
* search index lag
* clock skew between services
* approval at exact daylight saving transition
* approval at exact midnight
* approval just before launch cutoff for feature-eligible approvals

### 6.7 Acceptance criteria

1. Given a post-launch unapproved vehicle, when admin approves it at `T0`, then business state is `Approved` at `T0`.
2. Given approval at `T0`, then seller/admin status displayed immediately after success is `Approved – VIP Early Access`.
3. Given approval at `T0`, then end instant is exactly `T0 + 24 hours`.
4. Given approval succeeds, there is no UI or admin control allowing skip, extend, shorten, or end of VIP phase.
5. Given approval timestamp write fails, approve action fails and vehicle does not enter a partially approved visible state.

---

## 7. Functional rule: VIP Early Access time window

### 7.1 Window definition

VIP Early Access starts exactly at `approval_timestamp`.

VIP Early Access ends exactly at `approval_timestamp + 24 hours`.

### 7.2 Boundary logic

For any evaluation at time `T`:

* if `approval_timestamp <= T < approval_timestamp + 24 hours`, phase is active
* if `T >= approval_timestamp + 24 hours`, phase is inactive

### 7.3 Validation

Blocking rule:

* no calendar-date interpretation is allowed
* no “end of day,” “next day,” or “same local hour next date” logic is allowed
* no timezone business window is allowed

### 7.4 Propagation

At the first evaluation where `T >= approval_timestamp + 24 hours`:

* seller/admin displayed status must change to `Approved`
* regular buyer restrictions must be removed
* VIP-only labels and filters must cease to identify the vehicle as VIP Early Access inventory
* normal marketplace ranking/search/detail/action behavior must apply

### 7.5 Edge cases

* exact boundary at millisecond/second precision
* server evaluation just before end and next request just after end
* stale cached teaser card after phase end
* background job delay; behavior must still be correct on read if no batch job has run
* DST transition within the 24-hour interval

### 7.6 Acceptance criteria

1. Given approval at `2026-03-19T10:15:00Z`, then the phase remains active until but not including `2026-03-20T10:15:00Z`.
2. At exactly `2026-03-20T10:15:00Z`, regular buyer restrictions no longer apply.
3. Timezone displayed to users may vary per existing platform behavior, but business gating must remain based on exact 24 elapsed hours from stored approval instant.

---

## 8. Seller-facing status behavior

### 8.1 Inputs

* vehicle approval state
* approval timestamp
* current timestamp

### 8.2 Output

Displayed seller status text:

* `Approved – VIP Early Access` while phase is active
* `Approved` after phase ends

### 8.3 Seller actions

Seller may view listing/status in existing seller surfaces.

Seller cannot:

* reveal release countdown through this feature
* see exact public release timestamp through this feature
* modify or end VIP Early Access through this feature

### 8.4 Validation

Blocking:

* seller status text must not use any alternative wording
* seller UI must not show long explanatory copy for this feature
* seller UI must not show countdown
* seller UI must not show exact release time

### 8.5 Propagation

Status text updates:

* immediately after approval success
* automatically after phase ends
* without seller action

Immutable:

* seller does not affect release timing

### 8.6 Edge cases

* seller viewing stale page across transition boundary
* vehicle approved while seller page already open
* localization fallback; if localization missing, canonical English string must be used rather than alternative wording

### 8.7 Acceptance criteria

1. During active phase, seller sees exactly `Approved – VIP Early Access`.
2. During active phase, seller does not see countdown or exact release time.
3. After phase ends, seller sees exactly `Approved`.

---

## 9. Admin-facing status behavior

### 9.1 Inputs

* vehicle approval state
* approval timestamp
* current timestamp

### 9.2 Output

Displayed admin status text:

* `Approved – VIP Early Access` while phase is active
* `Approved` after phase ends

### 9.3 Admin actions

Admin may:

* view vehicle status in moderation/admin interfaces

Admin cannot:

* skip phase
* shorten phase
* extend phase
* end phase manually
* publicly release early

### 9.4 Validation

Blocking:

* admin surfaces must use exact required strings
* no manual override control may be present for this feature

### 9.5 Propagation

Admin status updates:

* immediately after approval
* automatically after phase ends

### 9.6 Edge cases

* admin list view sorting/filtering by status during phase
* admin page loaded before boundary and refreshed after boundary
* duplicate admin caches

### 9.7 Acceptance criteria

1. During active phase, admin sees exactly `Approved – VIP Early Access`.
2. After phase ends, admin sees exactly `Approved`.
3. No admin control exists to override phase duration.

---

## 10. VIP buyer browse/list behavior

### 10.1 Inputs

* current user VIP status
* approval state
* approval timestamp
* current timestamp
* list context query parameters
* existing eligibility/ranking logic

### 10.2 Output

For VIP buyer during active phase:

* vehicle appears as normal full listing card
* card includes normal listing content per existing platform behavior
* card includes one clear UI identifier showing vehicle is in `VIP Early Access`

### 10.3 Required UI output

The system must render exactly one clear UI identifier for VIP Early Access vehicles in VIP buyer surfaces. The exact component style is not specified here, but it must be:

* visible on listing card and/or equivalent primary discovery surface
* explicitly labeled with `VIP Early Access`
* not hidden behind click/hover only
* not ambiguous with other tags

### 10.4 User actions

VIP buyer may:

* view vehicle in browse/list
* click into detail page
* bid
* use Buy Now
* add to watchlist
* use all standard buyer flows normally, subject to existing unrelated platform rules

### 10.5 Validation

Blocking:

* VIP buyer must not receive teaser card instead of full listing
* required identifier must be present
* VIP buyer must not be blocked from detail, bid, Buy Now, or watchlist solely because vehicle is in VIP Early Access

Warning-only:

* if UI identifier fails to render but access remains correct, this is a feature defect but should not corrupt access logic

### 10.6 Propagation

Upon approval:

* listing becomes visible to VIP buyers immediately
* VIP filter membership becomes active immediately

After phase end:

* listing remains visible as normal listing
* VIP Early Access identifier must stop rendering as phase-specific inventory marker
* VIP filter must no longer include this vehicle under active-phase results

### 10.7 Edge cases

* VIP status changes during active phase
* VIP user session created before approval and browsing after approval
* card cache without phase badge
* buyer promoted/demoted between VIP and regular during active phase

### 10.8 Acceptance criteria

1. During active phase, VIP buyer sees normal full listing card.
2. During active phase, VIP buyer can open detail page.
3. During active phase, VIP buyer can bid, Buy Now, and watchlist if otherwise allowed by standard rules.
4. During active phase, VIP buyer sees a clear `VIP Early Access` identifier.
5. After phase end, listing remains visible but no longer behaves as active VIP-only inventory.

---

## 11. VIP buyer detail page behavior

### 11.1 Inputs

* current user VIP status
* approval state
* approval timestamp
* current timestamp
* vehicle detail request

### 11.2 Output

For VIP buyer during active phase:

* full normal detail page is rendered
* countdown and price are fully visible as usual under existing platform behavior
* all normal vehicle-specific content is visible

### 11.3 User actions

VIP buyer may:

* view detail page
* bid
* Buy Now
* watchlist
* use normal buyer flows available for approved vehicles

### 11.4 Validation

Blocking:

* detail page access must not be denied to VIP buyers during active phase because of this feature
* content must not be downgraded to teaser content for VIP buyers during active phase

### 11.5 Propagation

* no extra manual activation step required
* access is determined dynamically based on VIP status and active phase

### 11.6 Edge cases

* detail page opened before VIP status downgraded
* stale permission on long-lived session
* cached detail response shared across buyer types

### 11.7 Acceptance criteria

1. VIP buyer requesting detail during active phase receives normal full detail page.
2. Countdown and price remain visible as usual.
3. VIP buyer can complete normal buyer actions unless unrelated existing rules block them.

---

## 12. VIP buyer filter behavior

### 12.1 Inputs

* current user VIP status
* phase activity
* search/filter request

### 12.2 Output

System must provide one filter enabling VIP buyers to view/filter vehicles in active VIP Early Access.

Required filter behavior:

* filter is visible only where VIP buyer filters are supported
* filter returns vehicles currently in active VIP Early Access
* filter excludes vehicles whose phase ended
* filter excludes vehicles not yet approved
* filter excludes vehicles not visible to current VIP buyer under unrelated existing rules

### 12.3 User actions

VIP buyer may:

* activate filter
* deactivate filter
* combine with other existing filters where supported

Regular buyer must not be provided this filter.

### 12.4 Validation

Blocking:

* filter must not appear for regular buyers
* filter must not include expired-phase vehicles
* filter must not include non-approved vehicles
* filter label must clearly communicate VIP Early Access inventory

### 12.5 Propagation

On approval:

* vehicle enters filter result set immediately

On phase end:

* vehicle leaves filter result set automatically

### 12.6 Edge cases

* filter result caching across transition boundary
* pagination when an item expires between pages
* combined filters narrowing zero results
* buyer loses VIP status while filter active

### 12.7 Acceptance criteria

1. VIP buyers have a filter for VIP Early Access vehicles.
2. Regular buyers do not see this filter.
3. Vehicles enter filter results immediately upon approval.
4. Vehicles are removed from filter results exactly when phase ends.

---

## 13. Share behavior for VIP buyers

### 13.1 Inputs

* current user VIP status
* active phase
* share-entry surface
* shared URL request

### 13.2 Output

During active phase:

* VIP users must not be able to use sharing of the page URL as part of this feature

Required minimum behavior:

* any explicit share control tied to the vehicle detail/listing page must be unavailable, hidden, or disabled for VIP Early Access vehicles during active phase
* copying or generating a shareable feature-specific URL must not be offered by the product during active phase

### 13.3 User actions

VIP buyer cannot:

* use listing share control for an active VIP Early Access vehicle through feature-owned sharing UI

### 13.4 Validation

Blocking:

* no active-phase share entry point may remain usable in feature-owned UI

Out of scope:

* general browser URL copy behavior cannot be fully prevented by product specification; this feature only prohibits product-supported share functionality

### 13.5 Propagation

After phase end:

* existing normal sharing behavior may resume per platform rules

### 13.6 Edge cases

* mobile native share sheet
* hidden but still callable share endpoint
* copied old share link after phase ended
* direct deep link access by regular buyer during phase must still be blocked by detail access rules

### 13.7 Acceptance criteria

1. During active phase, VIP buyer is not offered usable in-product sharing control for the page URL.
2. If a regular buyer somehow obtains a direct URL during active phase, access is still blocked by regular-buyer detail access rules.

---

## 14. Regular buyer browse/list behavior

### 14.1 Inputs

* current user is non-VIP
* approval state
* approval timestamp
* current timestamp
* browse/list request
* ranking context

### 14.2 Output

During active phase, regular buyers may see a restricted teaser card only in browse contexts where such teaser exposure is supported.

Required teaser card content:

* no image
* no seller identity
* no vehicle-specific detailed content
* teaser text exactly `Early access for VIP buyers`
* no usable entry to vehicle detail page

### 14.3 Explicit prohibitions

Teaser card must not contain:

* vehicle image
* seller name or seller identity indicator
* make/model or uniquely identifying vehicle details if those create direct discovery
* VIN or registration related identifiers
* exact vehicle title if vehicle-specific discovery would result
* price
* countdown
* location if vehicle-specific
* bid state or Buy Now data
* watchlist entry point
* detail-page link or clickable destination to full details

### 14.4 User actions

Regular buyer may:

* view teaser card if surfaced in browse

Regular buyer cannot:

* click through to detail page
* bid
* Buy Now
* watchlist

### 14.5 Validation

Blocking:

* teaser card must not reveal prohibited fields
* teaser card must not contain usable detail-page navigation
* teaser card must not appear equal to or above normally accessible listings in ranking priority when both are present in same result set

### 14.6 Ranking output

Where teaser cards are shown for regular buyers:

* they must be ranked lower than normally accessible vehicles in the same result set

No exact ranking formula is specified, but pass/fail rule is:

* teaser cards must not outrank normal accessible listings solely due to standard relevance/sort unless there are no normal accessible listings remaining in the visible result window after application of sort and filters

### 14.7 Propagation

During active phase:

* browse surfaces recompute whether to render teaser vs full card based on buyer type

After phase end:

* teaser card must be replaced by full normal listing card for regular buyers
* ranking behavior reverts to normal marketplace behavior

### 14.8 Edge cases

* teaser card cached after release
* teaser card appears in mixed results with no normal cards
* pagination where item transitions between requests
* regular buyer becoming VIP during session
* regular buyer clicking stale cached teaser action target

### 14.9 Acceptance criteria

1. During active phase, regular buyer never sees full listing card for affected vehicle.
2. If browse teaser is shown, it contains no image.
3. If browse teaser is shown, it contains no seller identity.
4. If browse teaser is shown, it contains no vehicle-specific detailed content.
5. If browse teaser is shown, it displays exactly `Early access for VIP buyers`.
6. During active phase, teaser card does not allow detail page navigation.
7. In a result set containing normal accessible vehicles and teaser cards, teaser cards rank below normal accessible vehicles.
8. After phase end, regular buyer sees normal full listing card.

---

## 15. Regular buyer search behavior

### 15.1 Inputs

* current user is non-VIP
* active phase
* search query
* search index/document fields

### 15.2 Output

During active phase, regular buyers must not be able to directly discover VIP Early Access vehicles through vehicle-specific search behavior.

Required result behavior:

* vehicle must not be returned as a normal discoverable result for direct vehicle-specific searches such as name or similar direct discovery queries
* teaser exposure in browse contexts does not override direct-search suppression

### 15.3 User actions

Regular buyer may search normally across accessible inventory.

Regular buyer cannot use vehicle-specific search to discover active VIP Early Access vehicles.

### 15.4 Validation

Blocking:

* active VIP Early Access vehicle must not be matched into regular-buyer searchable vehicle-specific result sets
* any search suggestions/autocomplete under existing search system must not expose unique vehicle-specific identification for these vehicles to regular buyers during active phase if derived from searchable inventory

### 15.5 Propagation

On approval:

* regular-buyer search discoverability must be suppressed immediately or at next search-serving evaluation layer
* if indexing lag exists, serving layer must still enforce suppression before response is returned

After phase end:

* search discoverability returns automatically

### 15.6 Edge cases

* index contains document before approval
* search cache returns stale result
* regular buyer pastes exact model text
* external referral lands on internal search URL
* autocomplete suggestion cache

### 15.7 Acceptance criteria

1. During active phase, regular buyer searching by vehicle-specific name/model/direct query does not receive full discoverable result for that vehicle.
2. During active phase, vehicle-specific search does not expose enough identifying data to reconstruct the vehicle from search results.
3. After phase end, normal search discoverability resumes.

---

## 16. Regular buyer detail page access

### 16.1 Inputs

* current user is non-VIP
* active phase
* detail page request for vehicle

### 16.2 Output

During active phase:

* regular buyer cannot open the detail page

Required response behavior:

* detail page content must not render
* no bid, Buy Now, or watchlist controls may be exposed through detail response
* response may be existing platform-standard access denied / unavailable behavior, but it must not reveal full vehicle details

### 16.3 User actions

Regular buyer cannot:

* open detail page via direct URL
* open detail page from teaser
* open detail page through internal redirect or deep link during active phase

### 16.4 Validation

Blocking:

* any detail page request by regular buyer during active phase must be denied before full detail content renders
* hidden controls on blocked detail page are insufficient; content itself must not be accessible

### 16.5 Propagation

* access check is evaluated on every request or equivalent session-authorized fetch
* stale direct links must still be blocked during phase
* access opens automatically after phase end

### 16.6 Edge cases

* direct URL copied from VIP user
* bookmarked URL
* detail SSR cache keyed without buyer type
* API detail endpoint callable directly
* expired session role change from VIP to regular while page open

### 16.7 Acceptance criteria

1. During active phase, regular buyer requesting detail page receives no full detail page.
2. During active phase, direct URL access is blocked.
3. During active phase, no detail payload exposing full vehicle content is returned to regular buyer.
4. After phase end, regular buyer can open detail page normally.

---

## 17. Regular buyer action permissions

### 17.1 Inputs

* current user is non-VIP
* active phase
* attempted action type:

  * bid
  * Buy Now
  * watchlist

### 17.2 Output

During active phase, regular buyer cannot:

* bid
* use Buy Now
* watchlist

Required output per action:

* action entry points must not be available in UI where possible
* server/API must reject attempts if invoked directly
* rejection response must not reveal restricted detail data

### 17.3 User actions

Regular buyer may not perform any of the above actions on active VIP Early Access vehicles.

### 17.4 Validation

Blocking:

* UI suppression alone is insufficient
* backend action authorization must reject direct calls from regular buyers during active phase

Warning-only:

* attempted action logging may occur per existing platform behavior but is not required by this spec

### 17.5 Propagation

* permissions are recomputed immediately upon approval
* permissions are removed exactly at phase end

### 17.6 Edge cases

* user opens bid modal as VIP then loses VIP status before submit
* stale frontend state shows enabled button
* watchlist API called directly from saved request
* Buy Now deeplink from cached page

### 17.7 Acceptance criteria

1. During active phase, regular buyer cannot bid through UI or direct endpoint call.
2. During active phase, regular buyer cannot Buy Now through UI or direct endpoint call.
3. During active phase, regular buyer cannot watchlist through UI or direct endpoint call.
4. After phase end, normal action permissions apply.

---

## 18. Post-phase automatic release

### 18.1 Inputs

* current timestamp
* approval timestamp
* vehicle approval state

### 18.2 Output

At exact phase end:

* VIP Early Access restrictions end automatically
* regular buyers receive full normal access
* seller/admin displayed status becomes `Approved`
* vehicle exits VIP Early Access filter set
* VIP-only label/identifier stops being shown as phase-active marker
* normal marketplace behavior applies

### 18.3 User actions

No user action is required from:

* admin
* seller
* VIP buyer
* regular buyer

### 18.4 Validation

Blocking:

* no manual release step may exist
* no queued manual job approval may be required
* if a scheduler is delayed, read-time access logic must still honor expiration deterministically

### 18.5 Propagation

At or after exact end timestamp:

* browse/list recomputes to full card for regular buyers
* search discoverability resumes for regular buyers
* detail page access opens for regular buyers
* bid/Buy Now/watchlist permissions normalize
* seller/admin status text changes
* VIP filter membership removed

### 18.6 Edge cases

* no request occurs exactly at boundary
* scheduled job delayed
* cache not yet invalidated
* paginated list contains teaser fetched just before boundary

### 18.7 Acceptance criteria

1. At exact `approval_timestamp + 24 hours`, regular buyers gain access without manual action.
2. Seller/admin status automatically becomes `Approved`.
3. No admin or seller action is required for release.
4. If background expiry processing is delayed, user-facing behavior is still correct based on timestamp evaluation.

---

## 19. Access-control matrix

### 19.1 During active VIP Early Access

| Actor          | Browse/list                                      |                        Search direct discovery |              Detail page |     Bid | Buy Now | Watchlist |                                Share feature |
| -------------- | ------------------------------------------------ | ---------------------------------------------: | -----------------------: | ------: | ------: | --------: | -------------------------------------------: |
| Admin          | Existing admin behavior                          |                        Existing admin behavior |  Existing admin behavior |     N/A |     N/A |       N/A |                      Existing admin behavior |
| Seller         | Existing seller behavior                         |                                            N/A | Existing seller behavior |     N/A |     N/A |       N/A |                     Existing seller behavior |
| VIP buyer      | Full normal listing + VIP identifier             |                  Searchable per existing rules |                  Allowed | Allowed | Allowed |   Allowed | In-product share disallowed for this feature |
| Regular buyer  | Restricted teaser only where surfaced            | Blocked from direct vehicle-specific discovery |                  Blocked | Blocked | Blocked |   Blocked |                                          N/A |
| Anonymous user | Treat as regular buyer or stricter existing rule |                                        Blocked |                  Blocked | Blocked | Blocked |   Blocked |                                          N/A |

### 19.2 After phase end

| Actor         | Browse/list | Search | Detail page |          Bid |      Buy Now |    Watchlist |
| ------------- | ----------- | -----: | ----------: | -----------: | -----------: | -----------: |
| VIP buyer     | Normal      | Normal |      Normal | Normal rules | Normal rules | Normal rules |
| Regular buyer | Normal      | Normal |      Normal | Normal rules | Normal rules | Normal rules |

---

## 20. Validation and error-state rules

### 20.1 Approval-time errors

Blocking:

* approval transaction failure
* inability to persist approval timestamp
* inability to persist approved state

Required result:

* do not produce half-approved state
* do not produce visible VIP phase without successful approval completion

### 20.2 Read-time visibility errors

Blocking:

* if role evaluation fails for buyer, fail closed to regular-buyer restrictions
* if phase evaluation fails because approval timestamp missing for a supposedly feature-eligible approved vehicle, fail closed to restricted public access and raise system defect condition internally; VIP access may be granted only if system can still safely verify authorized role and timing from durable source

### 20.3 Action-time authorization errors

Blocking:

* if permission check cannot verify buyer eligibility, reject action
* if action request occurs during phase from regular buyer, reject action

### 20.4 UI inconsistency states

Warning:

* badge missing for VIP buyer while access is otherwise correct
* stale teaser remains visible briefly after phase end but clicking refresh/refetch resolves; however server responses must already be correct
* ranking defect where teaser appears above normal listing is blocking for launch quality

### 20.5 Explicit blocking vs warning classification

Blocking defects:

* regular buyer can view detail page during phase
* regular buyer can perform bid/Buy Now/watchlist during phase
* regular buyer can directly discover vehicle by vehicle-specific search during phase
* teaser reveals forbidden data
* seller/admin see wrong status wording
* admin can override phase
* phase lasts not exactly 24 hours
* retroactive application to pre-launch approvals

Warning defects:

* non-critical visual styling mismatch of VIP identifier, provided text remains clear
* delayed removal from VIP filter caused only by client cache, provided refetch returns correct server results

---

## 21. Propagation rules summary by object

### 21.1 Recompute immediately on approval

* buyer access gating
* browse/list representation
* search suppression for regular buyers
* detail access permissions
* bid/Buy Now/watchlist permissions
* VIP filter membership
* seller status text
* admin status text

### 21.2 Recompute immediately at phase end

* seller status text to `Approved`
* admin status text to `Approved`
* regular buyer browse/list from teaser to full card
* regular buyer search discoverability on
* regular buyer detail access on
* regular buyer bid/Buy Now/watchlist permissions on
* VIP filter membership off
* VIP phase badge/identifier off as active-phase marker

### 21.3 Must remain immutable

* approval timestamp
* approval-derived end timestamp
* fact that approval business result is `Approved`

### 21.4 Must not change because of this feature

* approval workflow sequence
* VIP eligibility rules
* notification behavior
* seller post-approval editing rules
* rejection/revocation flows
* legal/commercial policy
* backend schema choice

---

## 22. Top edge cases and required outcomes

### 22.1 Approval double-submit

Input:

* admin submits approve twice due to retry or double click

Required outcome:

* one approval timestamp only
* one effective phase window only
* no extension/reset from duplicate request

Acceptance test:

* second submission does not alter end timestamp

### 22.2 Clock skew

Input:

* approval service and read service have minor clock differences

Required outcome:

* phase computed from durable approval timestamp and trusted current time source
* no buyer-type leakage due to skew

Acceptance test:

* boundary logic remains consistent within system-defined authoritative time source

### 22.3 Cache leakage across user types

Input:

* VIP page cached and later served to regular buyer

Required outcome:

* forbidden; cache or response gating must prevent buyer-type leakage

Acceptance test:

* regular buyer never receives full VIP detail/list payload during active phase

### 22.4 Search index lag

Input:

* search index still contains discoverable document

Required outcome:

* serving layer suppresses result for regular buyers during active phase

Acceptance test:

* regular buyer direct search still fails to discover vehicle

### 22.5 Boundary request at exact expiration instant

Input:

* request time equals exact `approval_timestamp + 24 hours`

Required outcome:

* treat phase as ended
* public access allowed

Acceptance test:

* request at exact boundary returns public-access behavior

### 22.6 VIP status change mid-phase

Input:

* buyer is downgraded from VIP to regular during active phase

Required outcome:

* subsequent requests use current role
* user loses VIP-only access immediately on next authorization evaluation

Acceptance test:

* downgraded user can no longer open detail or act as VIP during active phase

### 22.7 Pre-launch approved inventory

Input:

* vehicle approved before rollout launch

Required outcome:

* no retroactive VIP Early Access application

Acceptance test:

* pre-launch approved vehicle remains normal approved inventory

### 22.8 Shared/direct URL access

Input:

* regular buyer obtains vehicle URL during active phase

Required outcome:

* detail access still denied

Acceptance test:

* direct URL does not bypass restriction

### 22.9 DST change during 24-hour window

Input:

* approval occurs before daylight-saving transition

Required outcome:

* end remains exactly 24 elapsed hours later, not local-clock same time next day

Acceptance test:

* elapsed-hours calculation is correct

### 22.10 Teaser ranking

Input:

* result set contains 10 normal accessible listings and 2 teaser cards

Required outcome:

* teaser cards rank below normal accessible listings

Acceptance test:

* teaser cards do not appear ahead of accessible listings in same ranked response

---

## 23. Deterministic pass/fail acceptance suite

### 23.1 Approval initiation

* Given a post-launch vehicle eligible for approval, when admin approves at time `T0`, then vehicle business state is `Approved` and phase active status is true for `T0 <= T < T0+24h`.

### 23.2 Seller/admin display during phase

* Given `T0 <= T < T0+24h`, seller sees `Approved – VIP Early Access`.
* Given `T0 <= T < T0+24h`, admin sees `Approved – VIP Early Access`.

### 23.3 Seller/admin display after phase

* Given `T >= T0+24h`, seller sees `Approved`.
* Given `T >= T0+24h`, admin sees `Approved`.

### 23.4 VIP browse

* Given VIP buyer and active phase, browse response includes full normal listing card and visible `VIP Early Access` identifier.

### 23.5 VIP detail

* Given VIP buyer and active phase, detail response returns full normal vehicle detail content.

### 23.6 VIP actions

* Given VIP buyer and active phase, bid/Buy Now/watchlist endpoints allow action subject to standard existing rules.

### 23.7 VIP filter

* Given VIP buyer and active phase, enabling VIP Early Access filter returns vehicle.
* Given `T >= T0+24h`, same filter no longer returns vehicle.

### 23.8 VIP sharing restriction

* Given VIP buyer and active phase, product share control for page URL is unavailable or unusable.

### 23.9 Regular browse teaser

* Given regular buyer and active phase in browse context where teaser is surfaced, response contains teaser only, with no image, no seller identity, no vehicle-specific detailed content, and exact text `Early access for VIP buyers`.

### 23.10 Regular search suppression

* Given regular buyer and active phase, direct vehicle-specific search query does not return full discoverable result for that vehicle.

### 23.11 Regular detail block

* Given regular buyer and active phase, detail page request is denied and no full vehicle details are returned.

### 23.12 Regular actions blocked

* Given regular buyer and active phase, bid endpoint rejects.
* Given regular buyer and active phase, Buy Now endpoint rejects.
* Given regular buyer and active phase, watchlist endpoint rejects.

### 23.13 Teaser ranking

* Given regular buyer result set with both normal accessible listings and teaser cards, teaser cards are ranked lower than normal accessible listings.

### 23.14 Automatic release

* Given `T = T0+24h`, regular buyer now receives full listing, searchable discovery, detail access, and normal actions without any manual release.

### 23.15 No override

* Given admin user, no UI or API operation exists in this feature to skip, shorten, extend, or manually end the phase.

### 23.16 No retroactivity

* Given vehicle approved before rollout launch, vehicle never enters VIP Early Access due solely to this feature launch.

### 23.17 Duplicate approval defense

* Given duplicate approval submissions, first successful approval sets the only effective approval timestamp and later duplicates do not reset the 24-hour window.

### 23.18 Boundary exactness

* Given request at `T0+24h-1ms`, regular buyer restrictions still apply.
* Given request at `T0+24h`, regular buyer restrictions no longer apply.

---

## 24. Out-of-scope enforcement

The following must not be added, changed, or assumed by this specification:

* notifications
* seller post-approval editing
* approval revocation/rejection edge-case handling
* legal/commercial policy
* VIP eligibility definition rules
* backend schema design specifics
* manual release flows
* backfill of historical approved vehicles
