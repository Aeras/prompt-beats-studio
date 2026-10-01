# PB-004 — Privileged RPC Authorization Classification

Snapshot: production `public` schema, 2026-10-01.

## Scope

- `SECURITY DEFINER` functions in `public`: 175
- authenticated-callable `SECURITY DEFINER` RPCs before remediation: 88
- authenticated-callable volatile RPCs: 71
- authenticated-callable stable/immutable RPCs: 17
- anonymous execution is not intentional for this authenticated surface.
- all reviewed high-impact functions use an explicit fixed `search_path`.

The classification below is the retained PB-004 contract. `Direct` means direct browser/PostgREST invocation is intentional; `Server` means the application calls the RPC from a server-function path while still relying on the authenticated user JWT; `Internal` means authenticated direct invocation is not required.

## High-impact classification matrix

| RPC / family | Intended caller | Role / capability | Invocation | Ownership / target guard | Account-state guard | SECURITY DEFINER rationale | Grant decision | Contract status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin_begin_account_deletion` | admin UI/server function | admin/super-admin | Server | target exists; self/protected-admin deletion blocked; operation bound to actor | actor checked through admin-level helpers | reads `auth.users`, creates one-time privileged operation | keep authenticated | reviewed |
| `admin_create_registration_block`, `admin_remove_registration_block`, `admin_list_registration_blocks` | admin UI/server functions | admin/super-admin | Server | block ID/email validation and row locking | admin-level helper | accesses privileged registration-block data | keep authenticated | reviewed |
| `admin_list_users`, `admin_user_detail` | moderation/admin UI | `can_view_users`; email/model-access fields restricted to admin level | Server | target IDs are read-only lookups | moderation capability derives banned/status state | reads `auth.users` and private profile data | keep authenticated | reviewed |
| `admin_overview` | admin dashboard | admin/super-admin | Server | n/a | admin-level helper | privileged aggregate over auth/private/usage tables | keep authenticated | reviewed |
| `admin_set_creator_donation_access`, `admin_set_creator_donations_global` | admin settings | admin/super-admin | Server | target existence / validated override | admin-level helper | writes protected settings/audit log | keep authenticated | reviewed |
| `admin_set_model_access` | admin settings | admin/super-admin | Server | target existence; access-mode validation; locking | admin-level helper | writes protected model-access state | keep authenticated | reviewed |
| `admin_set_moderation_status` | moderation administration | `can_suspend_moderator` plus role hierarchy | Server | self/protected-role checks; role hierarchy enforced | capability derives banned/status state | writes protected staff status/audit | keep authenticated | reviewed |
| `admin_set_user_banned` | moderation/admin UI | `can_block_users` / `can_unblock_users` plus hierarchy | Server | target exists; self/admin protection; moderator may act only on normal users | capability derives banned/status state | writes protected ban state/audit | keep authenticated; canonical path | reviewed |
| `admin_set_user_role` | admin role management | admin/super-admin with distinct assignment limits | Server | self/protected-account/last-super-admin guards | actor role validated under lock | writes protected role table/audit | keep authenticated | reviewed |
| `staff_get_track`, `staff_lock_track`, `staff_unlock_track`, `staff_delete_track` | moderation UI | `can_lock_tracks` / `can_delete_tracks` | Server | track existence/owner locking; protected admin-owner delete rule | capability derives banned/status state | bypasses track RLS for moderation duties | keep authenticated | reviewed |
| `feature_access_list`, `feature_access_search_users`, `feature_access_selected_users`, `feature_access_set_policy`, `feature_access_add_user`, `feature_access_remove_user` | super-admin feature access UI | super-admin | Server | feature/target existence and valid-account checks where needed | `current_user_is_super_admin`; selected user validity on add | reads auth email/private feature policy and writes grants | keep authenticated | reviewed |
| `take_moderation_case`, `get_content_report`, `list_content_reports`, `get_moderation_case`, `list_moderation_case_assignees`, `add_moderation_case_note`, `send_moderation_case_message`, `mark_moderation_case_read` | moderation case UI | moderation capabilities and case readability/assignment | Server | case/report ID validation; case read/assignment guards | capability derives banned/status state | case workflow crosses RLS-protected moderation tables | keep authenticated | reviewed |
| `propose_initial_case_decision`, `approve_initial_case_decision` | moderation/admin decision flow | assigned moderator/super-admin; approval requires admin level and anti-self-approval | Server | case state/assignment checks | role/capability checks | protected case/report state transition | keep authenticated | reviewed |
| `propose_moderation_case_appeal_decision`, `finalize_moderation_case_appeal`, `reopen_moderation_case` | admin/super-admin appeal flow | admin proposal; super-admin finalization/reopen | Server | case/appeal state checks | admin/super-admin helpers | privileged appeal finalization | keep authenticated | reviewed |
| `review_content_report` | existing report-review path | `can_view_users` | Server | report existence/status/content validation | moderation capability | legacy/current report workflow still has an application caller; do not revoke without Product workflow migration | keep authenticated | reviewed / retained |
| `consume_admin_account_deletion` | server deletion flow | same authenticated admin actor that created one-time operation | Server | operation actor, expiry and one-time consumption enforced by function | admin authorization established by operation flow | authorizes subsequent service-role auth deletion without exposing service key | keep authenticated | reviewed |
| `copy_prompt_version_to_project`, `move_prompt_version_to_project`, `detach_prompt_project_version` | Project UI | owning user | Direct/Server | `auth.uid() = _user_id`; implementation validates owned source/destination objects | authenticated user required | atomic cross-table version rehome | keep authenticated | reviewed |
| `link_project_version_tracks`, `unlink_project_version_track`, `set_primary_project_version_track` | Project Version UI | owning user | Direct/Server | project/version/track ownership and upload availability validated | authenticated user required | atomic relation mutation across RLS tables | keep authenticated | reviewed |
| `delete_track_with_cleanup`, `edit_track_with_cleanup`, `replace_track_with_audio_cleanup` | track owner UI | owning user | Direct/Server | track ownership and cleanup contracts enforced in function | authenticated/owner path | atomic storage-reference cleanup + track mutation | keep authenticated | reviewed |
| `create_track_share_link`, `update_track_share_link`, `revoke_track_share_link`, `list_my_share_management`, `record_track_public_share` | sharing UI | track/share owner | Direct/Server | owner-bound track/share IDs | authenticated owner | token/share mutations require atomic protected-table access | keep authenticated | reviewed |
| `create_private_review_session`, `create_private_track_review_session`, `list_my_private_review_sessions`, `get_my_private_review_session`, `add_private_review_creator_reply`, `close_private_review_session` | private review creator UI | session/project/track owner | Direct/Server | owner/session/project/track binding | authenticated owner | private-review token/session tables require controlled bypass | keep authenticated | reviewed |
| `start_generation_job`, `dismiss_generation_job` | Generator durable job path | current authenticated user | Direct/Server | job/input ownership/idempotency enforced by job contract | user admission/account controls in generation path | durable job orchestration | keep authenticated | reviewed |
| `start_quality_check_job`, `claim_quality_check`, `get_quality_check_job`, `get_latest_quality_check_job` | QC durable job path | current authenticated user | Direct/Server | user/idempotency/generation binding in QC contract | QC admission/account controls | durable QC orchestration | keep authenticated | reviewed |
| `admit_auxiliary_ai_request`, `claim_auxiliary_ai_request` | auxiliary AI tools | current authenticated user with feature/admission checks | Server | operation/request key bound to current user | account/feature admission | durable admission/idempotency | keep authenticated | reviewed |
| `admit_track_upload` | upload flow | current authenticated user | Server | current user admission only | account state enforced | rate/admission mutation outside simple RLS | keep authenticated | reviewed |
| `submit_track_report` | report UI | authenticated user | Direct/Server | target/report validation | authenticated reporter | atomic anti-abuse/report creation | keep authenticated | reviewed |
| `submit_moderation_case_appeal` | affected creator | target owner | Direct/Server | `target_owner_id = auth.uid()` and one-appeal/state guards | authenticated appellant | appeal state transition across protected tables | keep authenticated | reviewed |
| `set_user_banned(uuid, boolean)` | none in current application | legacy admin-only body | **Internal only** | historical admin checks exist, but current app has no caller | historical admin check | superseded by `admin_set_user_banned` | **revoke authenticated** | remediate |

## Lower-risk authenticated families retained

These RPCs remain intentionally authenticated because they are self-scoped, read-only/aggregate, or low-impact user actions whose bodies were checked for caller binding or public-object constraints:

- capability/self-state: `current_user_can_use_feature`, `current_user_has_role`, `current_user_is_admin_level`, `current_user_is_super_admin`, `current_user_is_banned`, `get_my_account_status`, `get_my_moderation_context`, `has_valid_account_state`, `has_moderation_capability`, `can_moderate_target`;
- social/library: `follow_creator`, `unfollow_creator`, `reorder_playlist_tracks`, `increment_track_play`, `like_count`.

## Remediation decision

PB-004 does **not** perform a mechanical revoke campaign. The concrete unnecessary authenticated privilege found in the current classification is the legacy `set_user_banned(uuid, boolean)` entry point. Current application callers use `admin_set_user_banned`, which carries the current moderation capability, role-hierarchy, reason and audit contract. The legacy function remains in schema for historical compatibility but is removed from the authenticated/PostgREST execution surface by forward migration.

## Post-remediation expected grant state

- `set_user_banned(uuid, boolean)`: `authenticated = false`, `anon = false`, `PUBLIC = false`, `service_role = true`.
- all other reviewed RPC grants are unchanged.
- expected authenticated-callable `SECURITY DEFINER` count: **87**.
