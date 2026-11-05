import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Crosshair,
  Keyboard,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { isMuted, loadMuted, saveMuted, setMuted, unlockAudio } from "@/game/audio";
import { anyCheat, DEFAULT_CHEATS, loadCheats, saveCheats } from "@/game/cheats";
import { cleanName, loadScores, qualifies, submitScore, type ScoreRow } from "@/game/scores";
import { mount, type GameApi } from "@/game/sim";
import { fetchOnlineScores, signInWithGoogle, signOutGoogle, submitOnlineScore, watchPilot, type OnlinePilot } from "@/lib/firebase";
import type { Cheats, Hud } from "@/game/types";

const EMPTY: Hud = {
  phase: "menu",
  score: 0,
  wave: 0,
  lives: 3,
  combo: 0,
  bestCombo: 0,
  shield: 0,
  speedT: 0,
  multiT: 0,
  multiLevel: 0,
  banner: "",
  bannerSub: "",
  left: 0,
  cheated: false,
  dashCd: 0,
  bombs: 1,
  bossHp: 0,
  bossMax: 0,
  overdrive: false,
  over: null,
};

function formatScore(n: number) {
  return Math.floor(n).toLocaleString("tr-TR");
}

const CHEAT_ROWS: { key: keyof Cheats; label: string; hint: string }[] = [
  { key: "ring", label: "Yüz mermi", hint: "Her atış 100 mermilik halka" },
  { key: "rapid", label: "Seri ateş", hint: "Namlu neredeyse durmaz" },
  { key: "oneShot", label: "Tek vuruş", hint: "İsabet düşmanı yok eder" },
  { key: "spread", label: "Beş namlu", hint: "Çoklu atış kilitli kalır" },
  { key: "shield", label: "Kalkan kilidi", hint: "Kalkan hiç düşmez" },
  { key: "turbo", label: "Turbo", hint: "Hız güçlendirmesi sürekli" },
  { key: "god", label: "Ölümsüz", hint: "Çarpışma can götürmez" },
];

export function NovaSiper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GameApi | null>(null);
  const driveRef = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<HTMLDivElement>(null);
  const handlers = useRef({ toggleMute: () => {} });
  const cheatsRef = useRef<Cheats>(DEFAULT_CHEATS);

  const [hud, setHud] = useState<Hud>(EMPTY);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [pilot, setPilot] = useState<{ uid: string; displayName: string | null; photoURL: string | null } | null>(null);
  const [onlineScores, setOnlineScores] = useState<OnlinePilot[]>([]);
  const [authBusy, setAuthBusy] = useState(false);
  const [onlineMessage, setOnlineMessage] = useState("");
  const [drive, setDrive] = useState(false);
  const [muted, setMutedUi] = useState(false);
  const [touchUi, setTouchUi] = useState(false);
  const [name, setName] = useState("");
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [cheats, setCheatsState] = useState<Cheats>(DEFAULT_CHEATS);
  const [cheatsOpen, setCheatsOpen] = useState(false);

  driveRef.current = drive;
  cheatsRef.current = cheats;

  const toggleCheat = (key: keyof Cheats) => {
    const next = { ...cheatsRef.current, [key]: !cheatsRef.current[key] };
    cheatsRef.current = next;
    setCheatsState(next);
    saveCheats(next);
    apiRef.current?.setCheats(next);
  };

  const toggleMute = () => {
    unlockAudio();
    const next = !isMuted();
    setMuted(next);
    saveMuted(next);
    setMutedUi(next);
    apiRef.current?.setMuted(next);
  };
  handlers.current.toggleMute = toggleMute;

  useEffect(() => {
    setScores(loadScores());
    let alive = true;
    void watchPilot((user) => {
      if (!alive) return;
      setPilot(user ? { uid: user.uid, displayName: user.displayName ?? null, photoURL: user.photoURL ?? null } : null);
    }).catch((error) => { if (alive) setOnlineMessage(error instanceof Error ? error.message : "Google girişi başlatılamadı."); });
    void fetchOnlineScores().then((rows) => { if (alive) setOnlineScores(rows); }).catch(() => { if (alive) setOnlineMessage("Çevrimiçi tablo yüklenemedi. Firestore kurallarını kontrol et."); });
    const loaded = loadCheats();
    cheatsRef.current = loaded;
    setCheatsState(loaded);
    const mute = loadMuted();
    setMuted(mute);
    setMutedUi(mute);
    const coarse = window.matchMedia("(pointer: coarse)");
    const sync = () => setTouchUi(coarse.matches);
    sync();
    coarse.addEventListener("change", sync);
    const onTouch = () => setTouchUi(true);
    window.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      coarse.removeEventListener("change", sync);
      window.removeEventListener("touchstart", onTouch);
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const api = mount(canvas, stage, {
      onHud: setHud,
      getPointerDrive: () => driveRef.current,
      onMuteToggle: () => handlers.current.toggleMute(),
    });
    api.setMuted(loadMuted());
    api.setCheats(cheatsRef.current);
    apiRef.current = api;
    return () => {
      api.destroy();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hud.phase === "over") {
      const stats = hud.over;
      if (stats && !stats.cheated && qualifies(scores, stats.score) && savedRank == null) nameRef.current?.focus();
      else primaryRef.current?.focus();
      return;
    }
    if (hud.phase !== "playing") primaryRef.current?.focus();
  }, [hud.phase, hud.over, savedRank, scores]);

  const start = () => {
    unlockAudio();
    setSavedRank(null);
    setName("");
    apiRef.current?.setMuted(isMuted());
    apiRef.current?.start();
  };

  const saveScore = async () => {
    const stats = hud.over;
    if (!stats || savedRank != null || stats.cheated) return;
    if (!qualifies(scores, stats.score)) return;
    const result = submitScore({
      name: cleanName(name),
      score: stats.score,
      wave: stats.wave,
      at: Date.now(),
    });
    setScores(result.rows);
    setSavedRank(result.rank);
    if (!pilot) { setOnlineMessage("Bu skor sadece bu cihazda kaydedildi. Dünya sıralaması için Google ile giriş yap."); return; }
    try {
      await submitOnlineScore({ name: cleanName(name), score: stats.score, wave: stats.wave, at: Date.now() }, pilot.uid);
      const latest = await fetchOnlineScores();
      setOnlineScores(latest);
      setOnlineMessage("Skor çevrimiçi sıralamaya gönderildi.");
    } catch (error) {
      setOnlineMessage(error instanceof Error ? error.message : "Skor çevrimiçi kaydedilemedi.");
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthBusy(true); setOnlineMessage("");
    try { await signInWithGoogle(); }
    catch (error) { setOnlineMessage(error instanceof Error ? error.message : "Google girişi başarısız."); }
    finally { setAuthBusy(false); }
  };
  const handleGoogleSignOut = async () => {
    setAuthBusy(true);
    try { await signOutGoogle(); setOnlineMessage("Google hesabından çıkış yapıldı."); }
    catch (error) { setOnlineMessage(error instanceof Error ? error.message : "Çıkış yapılamadı."); }
    finally { setAuthBusy(false); }
  };

  const best = scores[0]?.score ?? 0;
  const record = hud.phase === "playing" && hud.score > best && best > 0;
  const over = hud.over;
  const canSave = !!over && !over.cheated && qualifies(scores, over.score) && savedRank == null;
  const cheatOn = anyCheat(cheats);

  const onStickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    moveStick(e);
  };
  const moveStick = (e: ReactPointerEvent<HTMLDivElement>) => {
    const base = stickRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const max = rect.width / 2;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, max);
    dx = (dx / mag) * clamped;
    dy = (dy / mag) * clamped;
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    apiRef.current?.setStick(true, dx / max, dy / max);
  };
  const endStick = () => {
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
    apiRef.current?.setStick(false, 0, 0);
  };

  return (
    <div ref={stageRef} className="stage relative">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden />

      {hud.phase !== "menu" && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
          <div className="flex items-start justify-between gap-3 px-4 pt-3">
            <div>
              <div className="flex items-center gap-1" aria-label={`Can ${hud.lives}`}>
                {[0, 1, 2].map((i) => (
                  <LifePip key={i} lit={i < hud.lives} />
                ))}
                {hud.lives > 3 ? <span className="font-display text-xs tabular-nums text-primary">{hud.lives}</span> : null}
              </div>
              <p className="mt-1 font-display text-xs tracking-widest text-muted">
                DALGA <span className="text-primary">{String(Math.max(hud.wave, 1)).padStart(2, "0")}</span>
                {hud.phase === "playing" && hud.left > 0 ? <span className="ml-2 text-fg">· {hud.left} kalan</span> : null}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl leading-none tabular-nums text-fg">{formatScore(hud.score)}</p>
              {hud.combo >= 2 ? <p className="font-display text-sm text-primary">×{hud.combo} kombo</p> : null}
              {record ? <p className="text-xs text-primary">Yeni rekor</p> : null}
              {hud.cheated ? <p className="font-display text-xs tracking-widest text-danger">HİLE</p> : null}
            </div>
            <div className="flex shrink-0 gap-2">
              {hud.phase === "playing" ? (
                <button
                  type="button"
                  className={
                    cheatOn
                      ? "pointer-events-auto inline-flex h-11 items-center rounded-lg border border-danger bg-surface/90 px-3 font-display text-xs tracking-widest text-danger"
                      : "pointer-events-auto inline-flex h-11 items-center rounded-lg border border-border bg-surface/90 px-3 font-display text-xs tracking-widest text-fg"
                  }
                  aria-expanded={cheatsOpen}
                  onClick={() => {
                    setCheatsOpen(true);
                    apiRef.current?.pause();
                  }}
                >
                  Hile
                </button>
              ) : null}
              <button
                type="button"
                className="pointer-events-auto inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface/90 text-fg"
                aria-label={hud.phase === "playing" ? "Duraklat" : "Devam et"}
                onClick={() => (hud.phase === "playing" ? apiRef.current?.pause() : apiRef.current?.resume())}
              >
                {hud.phase === "playing" ? <Pause className="size-5" /> : <Play className="size-5" />}
              </button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 px-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-fg">
              <Crosshair className="size-3.5 text-primary" />
              {cheats.ring ? "Yüz mermi" : cheats.spread || hud.multiLevel >= 2 ? "Çoklu ×5" : hud.multiLevel === 1 ? "Çoklu ×3" : "Tek namlu"}
              {cheats.ring || cheats.spread ? (
                <span className="text-primary">∞</span>
              ) : hud.multiT > 0 ? (
                <span className="tabular-nums text-primary">{Math.ceil(hud.multiT)}s</span>
              ) : null}
            </span>
            {hud.shield > 0 || cheats.shield ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-fg">
                <Shield className="size-3.5 text-primary" />
                Kalkan
                <span className="tabular-nums text-primary">{cheats.shield ? "∞" : `${Math.ceil(hud.shield)}s`}</span>
              </span>
            ) : null}
            {hud.speedT > 0 || cheats.turbo ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-fg">
                <Zap className="size-3.5 text-primary" />
                Hız
                <span className="tabular-nums text-primary">{cheats.turbo ? "∞" : `${Math.ceil(hud.speedT)}s`}</span>
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-fg">
              Atıl
              <span className={hud.dashCd <= 0 ? "text-primary" : "tabular-nums text-muted"}>{hud.dashCd <= 0 ? "hazır" : `${Math.ceil(hud.dashCd)}s`}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-fg">
              Bomba
              <span className="tabular-nums text-primary">{hud.bombs}</span>
            </span>
            {hud.overdrive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-danger">Aşırı</span>
            ) : null}
          </div>
          {hud.bossMax > 0 ? (
            <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-label="Kırıcı canı">
              <div className="h-full bg-danger" style={{ width: `${Math.max(0, Math.min(100, (hud.bossHp / hud.bossMax) * 100))}%` }} />
            </div>
          ) : null}
          {hud.banner ? (
            <div className="banner-in px-4 pt-8 text-center">
              <p className="font-display text-3xl text-fg">{hud.banner}</p>
              <p className="text-sm text-muted">{hud.bannerSub}</p>
            </div>
          ) : null}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {hud.phase === "playing" ? hud.banner : hud.phase === "paused" ? "Duraklatıldı" : hud.phase === "over" ? "Oyun bitti" : ""}
      </p>

      {hud.phase === "menu" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col">
          <header className="pointer-events-auto flex items-center justify-between px-4 py-3 md:px-8">
            <h1 className="font-display text-sm tracking-widest text-fg">NOVA SİPER</h1>
            <div className="flex items-center gap-2">
              {pilot ? (
                <button type="button" disabled={authBusy} onClick={handleGoogleSignOut} className="max-w-36 truncate rounded-lg border border-border bg-surface/80 px-3 py-2 text-xs text-fg">{pilot.displayName || "Pilot"} · Çıkış</button>
              ) : (
                <button type="button" disabled={authBusy} onClick={handleGoogleSignIn} className="rounded-lg border border-primary/60 bg-surface/90 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-60">{authBusy ? "Bağlanıyor…" : "Google ile giriş"}</button>
              )}
              <MuteButton muted={muted} onClick={toggleMute} />
            </div>
          </header>
          <div className="flex-1" />
          <div className="pointer-events-auto mb-16 md:mr-8 md:ml-auto md:w-96">
            <div className="sheet rounded-t-2xl border border-border bg-surface/90 px-4 pt-4 backdrop-blur-md md:rounded-2xl md:px-5">
              <p className="font-display text-xs tracking-widest text-primary">ÜSTTEN BAKIŞLI NİŞANCI</p>
              <h2 className="mt-1 font-display text-4xl leading-none text-fg">Dalgayı kır.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Tek namluyla başla. Shift ile atıl, F ile bomba patlat. Kurşunun dibinden sıyırmak puan kazandırır. Her beş dalgada kırıcı gelir.
              </p>
              <button
                ref={primaryRef}
                type="button"
                className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-display text-base font-semibold text-bg"
                onClick={start}
              >
                <Play className="size-5" />
                Göreve başla
              </button>
              <CheatPanel cheats={cheats} onToggle={toggleCheat} />
              <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="Kontrol biçimi">
                <button
                  type="button"
                  aria-pressed={!drive}
                  className={drive ? "h-11 rounded-lg border border-border text-sm text-muted" : "h-11 rounded-lg bg-primary text-sm font-semibold text-bg"}
                  onClick={() => setDrive(false)}
                >
                  Klavye + nişan
                </button>
                <button
                  type="button"
                  aria-pressed={drive}
                  className={drive ? "h-11 rounded-lg bg-primary text-sm font-semibold text-bg" : "h-11 rounded-lg border border-border text-sm text-muted"}
                  onClick={() => setDrive(true)}
                >
                  İmleç sürüşü
                </button>
              </div>
              <ul className="mt-4 grid gap-2 text-sm text-muted">
                <li className="flex items-center gap-2">
                  <Keyboard className="size-4 shrink-0 text-primary" />
                  WASD veya oklar hareket. Boşluk ateş.
                </li>
                <li className="flex items-center gap-2">
                  <MousePointer2 className="size-4 shrink-0 text-primary" />
                  Fare nişan alır, basılı tutunca ateş eder.
                </li>
                <li className="flex items-center gap-2">
                  <Crosshair className="size-4 shrink-0 text-primary" />
                  İmleç sürüşü gemiyi yumuşakça imlece çeker.
                </li>
              </ul>
              {onlineMessage ? <p role="status" className="mt-3 text-xs text-muted">{onlineMessage}</p> : null}
              <OnlineScoreTable rows={onlineScores} signedIn={!!pilot} />
              <ScoreTable rows={scores} />
              <p className="mt-3 text-xs text-muted">Esc duraklatır · M sesi kapatır · Dokunmatikte sürükle veya çubuğu kullan.</p>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "paused" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center px-4">
          <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="sheet w-full max-w-sm rounded-2xl border border-border bg-surface/95 p-5">
            <h2 id="pause-title" className="font-display text-2xl text-fg">Duraklatıldı</h2>
            <p className="mt-1 text-sm text-muted">Dalga {hud.wave} · {formatScore(hud.score)} puan</p>
            <CheatPanel
              cheats={cheats}
              onToggle={toggleCheat}
              open={cheatsOpen}
              onOpenChange={setCheatsOpen}
              onRefill={() => apiRef.current?.refillLives()}
              onClear={() => apiRef.current?.clearField()}
            />
            <div className="mt-4 grid gap-2">
              <button ref={primaryRef} type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary font-display font-semibold text-bg" onClick={() => apiRef.current?.resume()}>
                <Play className="size-4" />
                Devam et
              </button>
              <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm text-fg" onClick={start}>
                <RotateCcw className="size-4" />
                Yeniden başlat
              </button>
              <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm text-fg" onClick={() => apiRef.current?.menu()}>
                Menü
              </button>
              <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm text-fg" onClick={toggleMute}>
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                {muted ? "Sesi aç" : "Sesi kapat"}
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "over" && over && (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto px-4 py-6">
          <div role="dialog" aria-modal="true" aria-labelledby="over-title" className="w-full max-w-sm rounded-2xl border border-border bg-surface/95 p-5">
            <h2 id="over-title" className="font-display text-2xl text-fg">Filo düştü</h2>
            <p className="mt-2 font-display text-3xl tabular-nums text-primary">{formatScore(over.score)}</p>
            <p className="text-sm text-muted">
              Dalga {over.wave}
              {over.combo > 1 ? ` · en iyi kombo ×${over.combo}` : ""}
            {over.cheated ? " · hile açık" : ""}
            </p>
            {over.cheated ? <p className="mt-2 text-sm text-danger">Hile kullanıldı. Bu skor tabloya yazılmaz.</p> : null}
            {canSave ? (
              <form
                className="mt-4 grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveScore();
                }}
              >
                <label htmlFor="callsign" className="text-sm text-fg">
                  Çağrı kodu
                </label>
                <input
                  ref={nameRef}
                  id="callsign"
                  value={name}
                  maxLength={12}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="PİLOT"
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 rounded-lg border border-border bg-bg px-3 text-fg"
                />
                <button type="submit" className="inline-flex h-11 items-center justify-center rounded-lg bg-primary font-display font-semibold text-bg">
                  Skoru kaydet
                </button>
              </form>
            ) : savedRank != null ? (
              <p className="mt-3 text-sm text-primary">{savedRank}. sıradasın.</p>
            ) : !over.cheated && over.score > 0 ? (
              <p className="mt-3 text-sm text-muted">Bu skor ilk 8’e giremedi.</p>
            ) : null}
            {onlineMessage ? <p role="status" className="mt-3 text-xs text-muted">{onlineMessage}</p> : null}
            <OnlineScoreTable rows={onlineScores} signedIn={!!pilot} />
            <ScoreTable rows={scores} />
            <div className="mt-4 grid gap-2">
              <button ref={canSave ? undefined : primaryRef} type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary font-display font-semibold text-bg" onClick={start}>
                <RotateCcw className="size-4" />
                Yeniden
              </button>
              <button type="button" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border text-sm text-fg" onClick={() => apiRef.current?.menu()}>
                Menü
              </button>
            </div>
          </div>
        </div>
      )}

      {hud.phase === "playing" && touchUi ? (
        <>
        <div className="absolute bottom-6 left-4 z-20">
          <div
            ref={stickRef}
            className="joy relative grid size-28 place-items-center rounded-full border border-border bg-surface/70"
            onPointerDown={onStickDown}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) moveStick(e);
            }}
            onPointerUp={endStick}
            onPointerCancel={endStick}
            role="group"
            aria-label="Hareket çubuğu"
          >
            <div ref={knobRef} className="size-12 rounded-full bg-primary" />
          </div>
        </div>
        <div className="absolute right-4 bottom-6 z-20 flex gap-2">
          <button
            type="button"
            className="h-14 min-w-14 rounded-full border border-border bg-surface/80 px-3 font-display text-xs tracking-widest text-fg"
            aria-label="Atıl"
            onPointerDown={(e) => {
              e.preventDefault();
              apiRef.current?.dash();
            }}
          >
            ATIL
          </button>
          <button
            type="button"
            className="h-14 min-w-14 rounded-full border border-border bg-surface/80 px-3 font-display text-xs tracking-widest text-fg"
            aria-label={`Bomba, ${hud.bombs} hak`}
            onPointerDown={(e) => {
              e.preventDefault();
              apiRef.current?.bomb();
            }}
          >
            BOM
          </button>
        </div>
        </>
      ) : null}
    </div>
  );
}

function OnlineScoreTable({ rows, signedIn }: { rows: OnlinePilot[]; signedIn: boolean }) {
  return (
    <section className="mt-4 rounded-xl border border-primary/30 bg-bg/50 p-3" aria-label="Dünya sıralaması">
      <p className="flex items-center gap-2 font-display text-xs tracking-widest text-primary"><Trophy className="size-3.5" /> DÜNYA SIRALAMASI</p>
      {!signedIn ? <p className="mt-2 text-xs text-muted">Çevrimiçi skor göndermek için Google ile giriş yap.</p> : null}
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted">Henüz çevrimiçi skor yok.</p> : (
        <ol className="mt-2">
          {rows.slice(0, 10).map((row, i) => (
            <li key={`${row.uid}-${row.at}-${i}`} className="flex items-baseline gap-3 border-t border-border py-1.5 text-sm">
              <span className={`w-5 tabular-nums ${i < 3 ? "font-bold text-primary" : "text-muted"}`}>{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-fg">{row.name}</span>
              <span className="tabular-nums text-fg">{formatScore(row.score)}</span>
              <span className="w-6 text-right tabular-nums text-muted">{row.wave}</span>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-[11px] text-muted">Hileli koşular gönderilmez. Çevrimiçi skorların kötüye kullanıma karşı tam doğrulanması için sunucu tarafı denetimi ayrıca gerekir.</p>
    </section>
  );
}

function CheatPanel({
  cheats,
  onToggle,
  open,
  onOpenChange,
  onRefill,
  onClear,
}: {
  cheats: Cheats;
  onToggle: (key: keyof Cheats) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRefill?: () => void;
  onClear?: () => void;
}) {
  return (
    <details
      className="mt-4 rounded-lg border border-border"
      {...(onOpenChange ? { open: open === true } : {})}
      onToggle={(e) => onOpenChange?.(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 font-display text-xs tracking-widest text-fg">
        HİLELER
        <span className="text-muted">{anyCheat(cheats) ? "AÇIK" : "KAPALI"}</span>
      </summary>
      <div className="grid gap-2 px-3 pb-3">
        {CHEAT_ROWS.map((row) => {
          const on = cheats[row.key];
          return (
            <button
              key={row.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(row.key)}
              className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left"
            >
              <span>
                <span className="block text-sm text-fg">{row.label}</span>
                <span className="block text-xs text-muted">{row.hint}</span>
              </span>
              <span className={on ? "font-display text-xs tracking-widest text-primary" : "font-display text-xs tracking-widest text-muted"}>
                {on ? "AÇIK" : "KAPALI"}
              </span>
            </button>
          );
        })}
        {onRefill && onClear ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="h-11 rounded-lg border border-border text-sm text-fg" onClick={onRefill}>
              Canı doldur
            </button>
            <button type="button" className="h-11 rounded-lg border border-border text-sm text-fg" onClick={onClear}>
              Sahayı sil
            </button>
          </div>
        ) : null}
        <p className="text-xs text-muted">Hile açıkken biten görev yüksek skora girmez. Seçimler bu cihazda kalır.</p>
      </div>
    </details>
  );
}

function LifePip({ lit }: { lit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={lit ? "size-5 text-primary" : "size-5 text-border"} aria-hidden>
      <path d="M22 12 8 20 12 12 8 4Z" fill="currentColor" />
    </svg>
  );
}

function MuteButton({ muted, onClick }: { muted: boolean; onClick: () => void }) {
  return (
    <button type="button" className="inline-flex size-11 items-center justify-center rounded-lg border border-border bg-surface/80 text-fg" aria-label={muted ? "Sesi aç" : "Sesi kapat"} onClick={onClick}>
      {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
    </button>
  );
}

function ScoreTable({ rows }: { rows: ScoreRow[] }) {
  return (
    <div className="mt-4">
      <p className="flex items-center gap-2 font-display text-xs tracking-widest text-muted">
        <Trophy className="size-3.5 text-primary" />
        YÜKSEK SKOR
      </p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Henüz kayıt yok. İlk pilot sen ol.</p>
      ) : (
        <ol className="mt-2">
          {rows.map((row, i) => (
            <li key={`${row.at}-${row.name}-${i}`} className="flex items-baseline gap-3 border-t border-border py-1.5 text-sm">
              <span className="w-5 tabular-nums text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-fg">{row.name}</span>
              <span className="tabular-nums text-fg">{formatScore(row.score)}</span>
              <span className="w-6 text-right tabular-nums text-muted">{row.wave}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
