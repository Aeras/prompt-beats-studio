import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BarChart3, Coins, Cpu, LayoutDashboard, Shield, Sparkles, Users, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/promptbeats/AppShell";
import { useModeration } from "@/hooks/useModeration";
import { useAuth } from "@/hooks/useAuth";
import { getAiAnalytics, type Breakdown } from "@/lib/ai-analytics.functions";
import { BLOCK_REASONS, deleteAdminUser, getAdminOverview, getAdminUserDetail, listAdminRegistrationBlocks, listAdminUsers, removeAdminRegistrationBlock, setAdminModelAccess, setModerationStatus, setAdminUserBanned, setAdminUserRole, type AdminUser, type RegistrationBlock } from "@/lib/admin.functions";
import { AI_MODELS, AI_MODEL_IDS, type AiModelId } from "@/lib/ai-models";
import { cn } from "@/lib/utils";
import { useI18n, type AppTranslationKey } from "@/i18n";

export const Route = createFileRoute("/management")({ head: () => ({ meta: [{ title: "Admin Dashboard | PromptBeats" }, { name: "robots", content: "noindex" }] }), component: ManagementPage });
type Section = "overview" | "analytics" | "users" | "registrations";
type ReasonCode = (typeof BLOCK_REASONS)[number]["code"];
type T = (key: AppTranslationKey, values?: Record<string, string | number>) => string;
const RANGES = [{ days: 1, label: "24h" }, { days: 7, label: "7d" }, { days: 30, label: "30d" }, { days: 90, label: "90d" }] as const;
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const reasonLabel = (code: string) => BLOCK_REASONS.find((reason) => reason.code === code)?.label ?? code;
const roleLabel = (role: string, status: string, t: T) => {
  const base = role === "admin" ? t("management.admin") : role === "senior_moderator" ? t("management.seniorModerator") : role === "moderator" ? t("management.moderator") : t("management.user");
  return status === "suspended" && role !== "admin" && role !== "user" ? `${base} · ${t("management.suspendedSuffix")}` : base;
};

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Coins; label: string; value: string; sub?: string }) {
  return <div className="glass rounded-2xl p-4"><div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground"><Icon className="h-4 w-4 text-primary" />{label}</div><p className="mt-2 font-display text-2xl font-bold">{value}</p>{sub && <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>}</div>;
}

function DataTable({ title, rows }: { title: string; rows: Breakdown[] }) {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const headers = [t("management.tableKey"), t("management.tableRequests"), t("management.tableInput"), t("management.tableOutput"), t("management.tableCost"), t("management.tableFailed")];
  return <div className="glass overflow-hidden rounded-2xl"><h2 className="border-b border-white/10 px-4 py-3 font-display text-sm font-semibold">{title}</h2><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr>{headers.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead><tbody>{rows.length === 0 && <tr><td className="px-4 py-4 text-muted-foreground" colSpan={6}>{t("management.noPeriodData")}</td></tr>}{rows.map((r) => <tr key={r.key} className="border-t border-white/5"><td className="px-4 py-2">{r.key}</td><td className="px-4 py-2">{num(r.requests)}</td><td className="px-4 py-2">{num(r.inputTokens)}</td><td className="px-4 py-2">{num(r.outputTokens)}</td><td className="px-4 py-2">{usd(r.costUsd)}</td><td className="px-4 py-2">{num(r.failures)}</td></tr>)}</tbody></table></div></div>;
}

function AdminNav({ section, setSection, isAdmin }: { section: Section; setSection: (s: Section) => void; isAdmin: boolean }) {
  const { t } = useI18n();
  const items: Array<[Section, string, typeof LayoutDashboard]> = isAdmin
    ? [["overview", t("management.overview"), LayoutDashboard], ["analytics", t("management.aiUsage"), BarChart3], ["users", t("management.users"), Users], ["registrations", t("management.blockedRegistrations"), Shield]]
    : [["users", t("management.users"), Users]];
  const future = isAdmin ? [t("management.subscriptions"), t("management.payments"), t("management.modelsAccess"), t("management.contentFiles"), t("management.settings")] : [];
  return <div className="flex gap-2 overflow-x-auto pb-1">{items.map(([id, label, Icon]) => <button key={id} onClick={() => setSection(id)} className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm", section === id ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:text-foreground")}><Icon className="h-4 w-4" />{label}</button>)}{future.map((label) => <span key={label} className="hidden shrink-0 items-center rounded-xl border border-white/5 px-3 py-2 text-xs text-muted-foreground/50 sm:inline-flex">{label}</span>)}</div>;
}

function OverviewPanel() {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-overview"], queryFn: () => getAdminOverview(), staleTime: 30_000 });
  if (isLoading) return <p className="text-sm text-muted-foreground">{t("management.loadingOverview")}</p>;
  if (error || !data) return <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("management.overviewError")}</div>;
  return <div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Stat icon={Users} label={t("management.totalUsers")} value={num(data.totalUsers)} /><Stat icon={Shield} label={t("management.blocked")} value={num(data.blockedUsers)} /><Stat icon={Sparkles} label={t("management.songsGenerated")} value={num(data.songsGenerated)} /><Stat icon={Cpu} label={t("management.aiRequests")} value={num(data.aiRequests)} /><Stat icon={BarChart3} label={t("management.failedRequests")} value={num(data.failedRequests)} /><Stat icon={Coins} label={t("management.estimatedCost")} value={usd(Number(data.estimatedCostUsd))} /></div><div className="glass rounded-2xl p-4"><h2 className="font-display text-sm font-semibold">{t("management.recentUsers")}</h2><div className="mt-3 divide-y divide-white/5">{data.recentUsers.map((u) => <div key={u.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="truncate">{u.displayName || `@${u.handle}`}</span><span className="text-xs text-muted-foreground">{u.blocked ? t("management.blocked") : t("management.active")} · {new Date(u.createdAt).toLocaleDateString(language === "el" ? "el-GR" : "en-US")}</span></div>)}</div></div></div>;
}

function AnalyticsPanel() {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useQuery({ queryKey: ["ai-analytics", days], queryFn: () => getAiAnalytics({ data: { days } }), staleTime: 30_000 });
  return <div className="space-y-5"><div className="flex flex-wrap gap-2">{RANGES.map((r) => <button key={r.days} onClick={() => setDays(r.days)} className={cn("rounded-full border px-4 py-1.5 text-xs", days === r.days ? "border-primary/60 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground")}>{t("management.lastRange", { range: r.label })}</button>)}</div>{error && <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("management.analyticsError")}</div>}{isLoading && <p className="text-sm text-muted-foreground">{t("management.loadingAnalytics")}</p>}{data && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Coins} label={t("management.estimatedCost")} value={usd(data.totals.costUsd)} sub={data.totals.unknownCostRequests > 0 ? `${t("management.perMonthPace", { cost: usd(data.forecast.monthly) })} · ${t("management.unknownPricing", { count: num(data.totals.unknownCostRequests) })}` : t("management.perMonthPace", { cost: usd(data.forecast.monthly) })} /><Stat icon={Cpu} label={t("management.tokens")} value={num(data.totals.totalTokens)} sub={`${num(data.totals.inputTokens)} in · ${num(data.totals.outputTokens)} out`} /><Stat icon={BarChart3} label={t("management.aiRequests")} value={num(data.totals.requests)} sub={`${num(data.totals.failures)} ${t("management.failed")}`} /><Stat icon={Sparkles} label={t("management.songsGenerated")} value={num(data.songs)} sub={`${usd(data.avgCostPerSong)} ${t("management.avgPerSong")}`} /></div><DataTable title={t("management.byProviderModel")} rows={data.byProviderModel} /><DataTable title={t("management.byOperation")} rows={data.byOperation} /><DataTable title={t("management.byDay")} rows={data.byDay} /></>}</div>;
}

const ModalNestingContext = createContext(false);
function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { t } = useI18n();
  const nested = useContext(ModalNestingContext);
  const content = <ModalNestingContext.Provider value={true}><div className={cn("fixed inset-0 z-50 grid place-items-center p-4 backdrop-blur-sm", nested ? "bg-transparent" : "bg-black/70")}><div className="glass-strong max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5 [&>button]:inline-flex [&>button]:w-fit [&>button]:shrink-0 [&>button+button]:ml-3">{children}<button onClick={onClose} className="mt-5 text-sm text-muted-foreground hover:text-foreground">{t("management.close")}</button></div></div></ModalNestingContext.Provider>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-black/10 p-3"><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm">{value}</p></div>; }
function ReasonFields({ code, setCode, text, setText, label }: { code: ReasonCode | ""; setCode: (v: ReasonCode | "") => void; text: string; setText: (v: string) => void; label: string }) {
  const { t } = useI18n();
  return <div className="space-y-2"><label className="text-xs text-muted-foreground">{label}<select value={code} onChange={(e) => setCode(e.target.value as ReasonCode | "")} className="mt-1 w-full rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-sm"><option value="">{t("management.selectReason")}</option>{BLOCK_REASONS.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}</option>)}</select></label>{code === "other" && <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("management.enterReason")} className="min-h-20 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" />}</div>;
}

function UserDetails({ userId, onClose, onChanged }: { userId: string; onClose: () => void; onChanged: () => void }) {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const locale = language === "el" ? "el-GR" : "en-US";
  const moderation = useModeration();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-user", userId], queryFn: () => getAdminUserDetail({ data: { userId } }) });
  const [mode, setMode] = useState<"inherit" | "custom">("inherit");
  const [models, setModels] = useState<AiModelId[]>([]);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [blockRegistration, setBlockRegistration] = useState(false);
  const [blockReason, setBlockReason] = useState<ReasonCode | "">("");
  const [blockReasonText, setBlockReasonText] = useState("");
  const [showBlock, setShowBlock] = useState(false);
  const [showUnblock, setShowUnblock] = useState(false);
  const [roleDraft, setRoleDraft] = useState<"user" | "moderator" | "senior_moderator">("user");

  useEffect(() => {
    if (!data) return;
    setMode(data.model_access.mode);
    setModels(data.model_access.models.filter((id): id is AiModelId => AI_MODEL_IDS.includes(id as AiModelId)));
    if (data.role !== "admin") setRoleDraft(data.role);
  }, [data]);

  const ban = useMutation({ mutationFn: (input: { banned: boolean; reasonCode?: ReasonCode; reasonText?: string }) => setAdminUserBanned({ data: { userId, ...input } }), onSuccess: (_, input) => { toast.success(input.banned ? t("management.userBlocked") : t("management.userUnblocked")); setShowBlock(false); setShowUnblock(false); qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["admin-user", userId] }); onChanged(); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("management.updateAccountError")) });
  const roleChange = useMutation({ mutationFn: () => setAdminUserRole({ data: { userId, role: roleDraft } }), onSuccess: () => { toast.success(t("management.roleUpdated")); qc.invalidateQueries({ queryKey: ["admin-user", userId] }); onChanged(); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("management.roleUpdateError")) });
  const moderationStatus = useMutation({ mutationFn: (input: { status: "active" | "suspended"; reasonText?: string }) => setModerationStatus({ data: { userId, ...input } }), onSuccess: () => { toast.success(t("management.moderationUpdated")); qc.invalidateQueries({ queryKey: ["admin-user", userId] }); onChanged(); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("management.moderationUpdateError")) });
  const access = useMutation({ mutationFn: () => setAdminModelAccess({ data: { userId, mode, models } }), onSuccess: () => { toast.success(t("management.accessSaved")); qc.invalidateQueries({ queryKey: ["admin-user", userId] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("management.accessSaveError")) });
  const deletion = useMutation({ mutationFn: () => deleteAdminUser({ data: { userId, confirmationEmail: deleteEmail, blockRegistration, registrationReasonCode: blockReason || undefined, registrationReasonText: blockReasonText || undefined } }), onSuccess: (result) => { toast.success(result.registrationBlocked ? t("management.deletedBlocked") : t("management.deleted")); qc.invalidateQueries({ queryKey: ["admin-users"] }); onClose(); onChanged(); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("management.deletionFailed")) });

  if (isLoading) return <Modal onClose={onClose}>{t("management.loadingUser")}</Modal>;
  if (error || !data) return <Modal onClose={onClose}>{t("management.loadUserError")}</Modal>;
  const targetLabel = moderation.isAdmin ? (data.email || t("management.thisUser")) : (data.display_name || (data.handle ? `@${data.handle}` : t("management.thisUser")));
  const toggle = (id: AiModelId) => setModels((current) => current.includes(id) ? current.filter((m) => m !== id) : [...current, id]);
  const validReason = Boolean(blockReason) && (blockReason !== "other" || Boolean(blockReasonText.trim()));
  const validRegistrationReason = !blockRegistration || validReason;
  const canModerateTarget = data.role !== "admin" && (moderation.isAdmin || moderation.canBlockUsers);
  const canSuspendTarget = moderation.isAdmin || (moderation.canSuspendModerator && data.role === "moderator" && data.moderation_status === "active");

  return <Modal onClose={onClose}>
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold">{t("management.userDetails")}</h2><p className="mt-1 text-sm text-muted-foreground">{moderation.isAdmin ? (data.email || t("management.noEmail")) : (data.display_name || (data.handle ? `@${data.handle}` : t("management.user")))}</p></div><button onClick={onClose} aria-label={t("common.close")}><X className="h-5 w-5" /></button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><Info label={t("management.displayName")} value={data.display_name || "—"} /><Info label={t("management.handle")} value={data.handle ? `@${data.handle}` : "—"} /><Info label={t("management.joined")} value={new Date(data.created_at).toLocaleString(locale)} /><Info label={t("management.role")} value={roleLabel(data.role, data.moderation_status, t)} /><Info label={t("management.status")} value={data.blocked ? `${t("management.blocked")} · ${reasonLabel(data.block_reason_code ?? "")}` : t("management.active")} /><Info label={t("management.generations")} value={num(data.generations)} /><Info label={t("management.aiRequests")} value={num(data.ai_requests)} />{data.blocked && <Info label={t("management.blockedAt")} value={data.blocked_at ? new Date(data.blocked_at).toLocaleString(locale) : "—"} />}</div>

    {moderation.isAdmin && data.role !== "admin" && <section className="mt-6 border-t border-white/10 pt-5"><h3 className="font-display text-sm font-semibold">{t("management.roleManagement")}</h3><div className="mt-3 flex flex-wrap items-center gap-2"><select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value as typeof roleDraft)} className="rounded-lg border border-white/10 bg-[#17131f] px-3 py-2 text-sm"><option value="user">{t("management.user")}</option><option value="moderator">{t("management.moderator")}</option><option value="senior_moderator">{t("management.seniorModerator")}</option></select><button disabled={roleChange.isPending || roleDraft === data.role} onClick={() => { if (window.confirm(`${t("management.saveRole")}: ${targetLabel} → ${roleLabel(roleDraft, "active", t)}?`)) roleChange.mutate(); }} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{roleChange.isPending ? t("profile.saving") : t("management.saveRole")}</button></div>
      {(data.role === "moderator" || data.role === "senior_moderator") && data.moderation_status === "active" && <button disabled={moderationStatus.isPending || !canSuspendTarget} onClick={() => { const reason = window.prompt(t("management.suspensionReason")); if (reason?.trim() && window.confirm(`${t("management.suspendModeration")}: ${targetLabel}?`)) moderationStatus.mutate({ status: "suspended", reasonText: reason }); }} className="mt-3 rounded-lg border border-amber-400/30 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">{t("management.suspendModeration")}</button>}
      {data.moderation_status === "suspended" && <button disabled={moderationStatus.isPending || !moderation.isAdmin} onClick={() => { if (window.confirm(`${t("management.reactivateModeration")}: ${targetLabel}?`)) moderationStatus.mutate({ status: "active" }); }} className="mt-3 ml-2 rounded-lg border border-primary/30 px-3 py-2 text-xs text-primary disabled:opacity-50">{t("management.reactivateModeration")}</button>}
    </section>}

    {moderation.isAdmin && <section className="mt-6 border-t border-white/10 pt-5"><h3 className="font-display text-sm font-semibold">{t("management.aiModelAccess")}</h3><div className="mt-3 flex gap-2"><button onClick={() => setMode("inherit")} className={cn("rounded-lg border px-3 py-2 text-xs", mode === "inherit" ? "border-primary bg-primary/15 text-primary" : "border-white/10")}>{t("management.inheritDefault")}</button><button onClick={() => setMode("custom")} className={cn("rounded-lg border px-3 py-2 text-xs", mode === "custom" ? "border-primary bg-primary/15 text-primary" : "border-white/10")}>{t("management.custom")}</button></div>{mode === "custom" && <div className="mt-3 grid gap-2 sm:grid-cols-2">{AI_MODELS.map((m) => <label key={m.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={models.includes(m.id)} onChange={() => toggle(m.id)} />{m.label}</label>)}</div>}<button disabled={access.isPending || (mode === "custom" && models.length === 0)} onClick={() => access.mutate()} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{access.isPending ? t("profile.saving") : t("management.saveAccess")}</button></section>}

    {canModerateTarget && <section className="mt-6 border-t border-white/10 pt-5"><h3 className="font-display text-sm font-semibold">{t("management.accountActions")}</h3>{data.blocked ? <><p className="mt-2 text-sm text-amber-200">{t("management.blocked")} · {reasonLabel(data.block_reason_code ?? "")}</p><button disabled={ban.isPending} onClick={() => setShowUnblock(true)} className="mt-3 rounded-xl border border-amber-400/30 px-4 py-2 text-sm text-amber-200 disabled:opacity-50">{t("management.unblockAccount")}</button></> : <button disabled={ban.isPending} onClick={() => setShowBlock(true)} className="mt-3 rounded-xl border border-amber-400/30 px-4 py-2 text-sm text-amber-200 disabled:opacity-50">{t("management.blockAccount")}</button>}</section>}

    {moderation.isAdmin && <div className="mt-6 rounded-xl border border-red-400/20 bg-red-400/5 p-4"><p className="text-sm font-semibold text-red-200">{t("management.dangerZone")}</p><p className="mt-1 text-xs text-muted-foreground">{t("management.dangerBody")}</p><input value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} placeholder={t("management.typeEmail")} className="mt-3 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm" /><label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={blockRegistration} onChange={(e) => setBlockRegistration(e.target.checked)} className="mt-0.5" />{t("management.blockReregistration")}</label>{blockRegistration && <div className="mt-3"><ReasonFields code={blockReason} setCode={setBlockReason} text={blockReasonText} setText={setBlockReasonText} label={t("management.registrationBlockReason")} /></div>}<button disabled={deletion.isPending || deleteEmail.toLowerCase() !== (data.email ?? "").toLowerCase() || data.is_admin || !validRegistrationReason} onClick={() => deletion.mutate()} className="mt-3 rounded-xl bg-red-500/80 px-4 py-2 text-sm font-medium disabled:opacity-50">{deletion.isPending ? t("management.deleting") : t("management.permanentlyDelete")}</button></div>}

    {showBlock && <Modal onClose={() => setShowBlock(false)}><h2 className="font-display text-xl font-bold">{t("management.confirmBlock")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("management.blockQuestion", { user: targetLabel })}</p><div className="mt-5"><ReasonFields code={blockReason} setCode={setBlockReason} text={blockReasonText} setText={setBlockReasonText} label={t("management.blockReason")} /></div><button disabled={ban.isPending || !validReason} onClick={() => ban.mutate({ banned: true, reasonCode: blockReason || undefined, reasonText: blockReasonText || undefined })} className="mt-5 rounded-xl bg-amber-500/80 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{ban.isPending ? t("management.blocking") : t("profile.confirmBlock")}</button></Modal>}
    {showUnblock && <Modal onClose={() => setShowUnblock(false)}><h2 className="font-display text-xl font-bold">{t("management.restoreAccess")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("management.restoreBody")}</p><button disabled={ban.isPending} onClick={() => ban.mutate({ banned: false })} className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{ban.isPending ? t("management.restoring") : t("management.confirmUnblock")}</button></Modal>}
  </Modal>;
}

function UsersPanel({ initialUserId, isAdmin }: { initialUserId?: string | null; isAdmin: boolean }) {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const locale = language === "el" ? "el-GR" : "en-US";
  const [draft, setDraft] = useState(""); const [search, setSearch] = useState(""); const [status, setStatus] = useState<"all" | "active" | "blocked">("all"); const [page, setPage] = useState(0); const [selected, setSelected] = useState<string | null>(initialUserId ?? null);
  useEffect(() => { if (initialUserId) setSelected(initialUserId); }, [initialUserId]);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(draft); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [draft]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["admin-users", search, status, page], queryFn: () => listAdminUsers({ data: { search, status, page, pageSize: 25 } }) });
  return <div className="space-y-4"><div className="flex flex-col gap-2 sm:flex-row"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={isAdmin ? t("management.searchAdmin") : t("management.searchStaff")} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm" /><select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} className="rounded-xl border border-white/10 bg-[#17131f] px-3 py-2 text-sm"><option value="all">{t("management.allUsers")}</option><option value="active">{t("management.active")}</option><option value="blocked">{t("management.blocked")}</option></select></div>{error && <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("management.loadUsersError")}</div>}{isLoading && <p className="text-sm text-muted-foreground">{t("management.loadingUsers")}</p>}<div className="glass overflow-hidden rounded-2xl"><MobileUserList users={data?.users ?? []} onManage={setSelected} isAdmin={isAdmin} /><div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-[11px] uppercase text-muted-foreground"><tr><th className="px-4 py-3">{t("management.user")}</th><th className="px-4 py-3">{t("management.joined")}</th><th className="px-4 py-3">{t("management.status")}</th><th className="px-4 py-3">{t("management.generations")}</th><th className="px-4 py-3" /></tr></thead><tbody>{(data?.users ?? []).map((u: AdminUser) => <tr key={u.id} className="border-t border-white/5"><td className="px-4 py-3"><p>{isAdmin ? (u.email || t("management.noEmail")) : (u.display_name || (u.handle ? `@${u.handle}` : t("management.user")))}</p><p className="text-xs text-muted-foreground">{u.display_name || (u.handle ? `@${u.handle}` : "")}</p></td><td className="px-4 py-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString(locale)}</td><td className="px-4 py-3">{u.blocked ? <span className="text-amber-200">{t("management.blocked")}</span> : roleLabel(u.role, u.moderation_status, t)}{u.moderation_status === "suspended" && <span className="ml-2 text-xs text-amber-200">{t("management.suspended")}</span>}</td><td className="px-4 py-3">{num(u.generations)}</td><td className="px-4 py-3 text-right"><button onClick={() => setSelected(u.id)} className="text-primary hover:underline">{t("management.manage")}</button></td></tr>)}</tbody></table></div>{data && <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-muted-foreground"><span>{t("management.userCount", { count: num(data.total) })}</span><div className="flex gap-2"><button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40">{t("management.previous")}</button><button disabled={(page + 1) * 25 >= data.total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40">{t("management.next")}</button></div></div>}</div>{selected && <UserDetails userId={selected} onClose={() => setSelected(null)} onChanged={() => { void refetch(); setSelected(null); }} />}</div>;
}

function MobileUserList({ users, onManage, isAdmin }: { users: AdminUser[]; onManage: (id: string) => void; isAdmin: boolean }) {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const locale = language === "el" ? "el-GR" : "en-US";
  return <div className="space-y-2 p-3 sm:hidden">{users.map((u) => <div key={u.id} className="rounded-xl border border-white/10 bg-black/10 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm">{isAdmin ? (u.email || t("management.noEmail")) : (u.display_name || (u.handle ? `@${u.handle}` : t("management.user")))}</p><p className="truncate text-xs text-muted-foreground">{u.display_name || u.handle || ""}</p></div><button onClick={() => onManage(u.id)} className="shrink-0 text-sm text-primary hover:underline">{t("management.manage")}</button></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{new Date(u.created_at).toLocaleDateString(locale)}</span><span className={u.blocked ? "text-amber-200" : ""}>{u.blocked ? t("management.blocked") : roleLabel(u.role, u.moderation_status, t)}</span><span>{t("management.generationCount", { count: num(u.generations) })}</span>{u.moderation_status === "suspended" && <span className="text-amber-200">{t("management.suspended")}</span>}</div></div>)}</div>;
}

function RegistrationBlocksPanel() {
  const { t, language } = useI18n();
  const num = (n: number) => n.toLocaleString(language === "el" ? "el-GR" : "en-US");
  const locale = language === "el" ? "el-GR" : "en-US";
  const [draft, setDraft] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(0); const [confirm, setConfirm] = useState<RegistrationBlock | null>(null); const qc = useQueryClient();
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(draft); setPage(0); }, 300); return () => window.clearTimeout(timer); }, [draft]);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-registration-blocks", search, page], queryFn: () => listAdminRegistrationBlocks({ data: { search, page, pageSize: 25 } }) });
  const removal = useMutation({ mutationFn: () => removeAdminRegistrationBlock({ data: { blockId: confirm!.id } }), onSuccess: () => { toast.success(t("management.registrationAllowed")); setConfirm(null); qc.invalidateQueries({ queryKey: ["admin-registration-blocks"] }); }, onError: (e) => toast.error(e instanceof Error ? e.message : t("management.removeBlockError")) });
  return <div className="space-y-4"><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("management.searchBlockedEmail")} className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm sm:max-w-md" />{error && <div className="glass rounded-2xl p-4 text-sm text-red-300">{t("management.loadBlocksError")}</div>}{isLoading && <p className="text-sm text-muted-foreground">{t("management.loadingBlocks")}</p>}<div className="glass overflow-hidden rounded-2xl"><div className="divide-y divide-white/5">{data?.blocks.map((block) => <div key={block.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm">{block.email_normalized}</p><p className="text-xs text-muted-foreground">{reasonLabel(block.reason_code)}{block.reason_code === "other" && block.reason_text ? ` · ${block.reason_text}` : ""} · {new Date(block.blocked_at).toLocaleDateString(locale)}</p></div><button onClick={() => setConfirm(block)} className="self-start rounded-lg border border-white/10 px-3 py-2 text-xs text-primary hover:border-primary/40">{t("management.allowAgain")}</button></div>)}{data?.blocks.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("management.noBlocks")}</p>}</div>{data && <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-muted-foreground"><span>{t("management.blockCount", { count: num(data.total) })}</span><div className="flex gap-2"><button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40">{t("management.previous")}</button><button disabled={(page + 1) * 25 >= data.total} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-white/10 px-3 py-1 disabled:opacity-40">{t("management.next")}</button></div></div>}</div>{confirm && <Modal onClose={() => setConfirm(null)}><AlertTriangle className="h-6 w-6 text-amber-300" /><h2 className="mt-3 font-display text-xl font-bold">{t("management.allowTitle")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("management.allowBody")}</p><button disabled={removal.isPending} onClick={() => removal.mutate()} className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{removal.isPending ? t("management.updating") : t("management.allowRegistration")}</button></Modal>}</div>;
}

function ManagementPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { isAdmin, canViewUsers } = useModeration();
  const [section, setSection] = useState<Section>("overview");
  const [initialUserId, setInitialUserId] = useState<string | null>(null);
  const header = <div><h1 className="font-display text-lg font-bold md:text-2xl">{isAdmin ? t("management.adminTitle") : t("management.staffTitle")}</h1><p className="text-[11px] text-muted-foreground md:text-xs">{isAdmin ? t("management.adminSubtitle") : t("management.staffSubtitle")}</p></div>;

  useEffect(() => { if (!loading) setSection(isAdmin ? "overview" : "users"); }, [loading, isAdmin]);
  useEffect(() => { const userId = new URLSearchParams(window.location.search).get("userId"); if (userId) { setInitialUserId(userId); setSection("users"); } }, []);

  if (!loading && (!user || !canViewUsers)) return <AppShell header={header}><main className="mx-auto max-w-[1600px] px-4 py-10 md:px-8"><div className="glass rounded-2xl p-6 text-sm text-muted-foreground">{t("management.restricted")} <Link to="/" className="text-accent hover:underline">{t("management.backFeed")}</Link></div></main></AppShell>;

  const sectionTitle = section === "overview" ? t("management.overview") : section === "analytics" ? t("management.analyticsTitle") : section === "users" ? t("management.usersModeration") : t("management.blockedRegistrations");
  return <AppShell header={header}><main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 pb-40 md:px-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-primary">{t("management.controlPanel")}</p><h2 className="mt-1 font-display text-2xl font-bold">{sectionTitle}</h2></div><Link to="/" className="text-sm text-muted-foreground hover:text-foreground">{t("management.backApp")}</Link></div><AdminNav section={section} setSection={setSection} isAdmin={isAdmin} />{!loading && isAdmin && section === "overview" && <OverviewPanel />}{!loading && isAdmin && section === "analytics" && <AnalyticsPanel />}{!loading && section === "users" && <UsersPanel initialUserId={initialUserId} isAdmin={isAdmin} />}{!loading && isAdmin && section === "registrations" && <RegistrationBlocksPanel />}</main></AppShell>;
}
