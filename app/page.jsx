'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track } from 'livekit-client';

async function request(path, { method = 'GET', body } = {}) {
  try {
    const result = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) throw new Error(data.error || 'No se pudo completar la operación');
    return data;
  } catch (e) {
    throw new Error(e.message || 'Error de conexión');
  }
}

function disconnectMessage(reason) {
  switch (reason) {
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Tu usuario se conectó desde otro dispositivo o pestaña.';
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'Tu cuenta fue desconectada de la sala de voz.';
    case DisconnectReason.ROOM_CLOSED:
    case DisconnectReason.ROOM_DELETED:
      return 'La sala se cerró temporalmente. Pulsa entrar para volver.';
    case DisconnectReason.SERVER_SHUTDOWN:
      return 'El servidor de voz se reinició. Pulsa entrar para reconectar.';
    case DisconnectReason.CONNECTION_TIMEOUT:
    case DisconnectReason.SIGNAL_CLOSE:
    case DisconnectReason.MEDIA_FAILURE:
      return 'Se perdió la conexión con la sala de voz. Revisa tu internet y vuelve a entrar.';
    default:
      return 'Se cerró la conexión con la sala de voz.';
  }
}

function Logo() {
  return (
    <div className="brand">
      <div className="pixel-logo" aria-hidden="true"><span>R</span></div>
      <div>
        <strong>REALMS <i>VOZ</i></strong>
        <small>SALA PRIVADA DE JUEGO</small>
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await request('/api/auth/login', {
        method: 'POST',
        body: { username: name.trim(), password },
      });
      onLogin({ username: data.username, role: data.role });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-layout">
      <div className="login-frame">
        <Logo />
        <div className="panel login-panel">
          <div className="panel-heading"><span className="status-dot" /> SOLO PARA INVITADOS</div>
          <h1>Entra y habla con tu grupo.</h1>
          <p>Un usuario, una contraseña y una sala para todos.</p>
          <form onSubmit={submit}>
            <label htmlFor="login-name">USUARIO</label>
            <input
              id="login-name"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Tu nombre de jugador"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={20}
            />
            <label htmlFor="login-password">CONTRASEÑA</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Tu contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="button primary full" disabled={busy}>
              {busy ? 'ENTRANDO...' : 'ENTRAR A REALMS'}
            </button>
          </form>
          {error && <div className="alert error" role="alert">{error}</div>}
          <p className="footnote">Las cuentas las crea únicamente el administrador.</p>
        </div>
        <p className="bottom-note">MINECRAFT BEDROCK · ANDROID · IPHONE · PC</p>
      </div>
    </main>
  );
}

function VoiceRoom() {
  const roomRef = useRef(null);
  const audioRef = useRef(null);
  const wakeLockRef = useRef(null);
  const manualExitRef = useRef(false);
  const localTrackCleanupRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [mic, setMic] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [speaking, setSpeaking] = useState([]);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState('');

  const clearAudioElements = useCallback(() => {
    audioRef.current?.replaceChildren();
  }, []);

  const releaseWakeLock = useCallback(async () => {
    try {
      await wakeLockRef.current?.release();
    } catch {}
    wakeLockRef.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || wakeLockRef.current) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
      });
      wakeLockRef.current = sentinel;
    } catch {}
  }, []);

  const setMediaSession = useCallback((active) => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      if (active && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Sala principal',
          artist: 'Realms Voz',
          album: 'Minecraft Bedrock',
        });
        navigator.mediaSession.playbackState = 'playing';
      } else {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    } catch {}
  }, []);

  const refreshParticipants = useCallback((room) => {
    if (!room) return;
    const people = [room.localParticipant, ...room.remoteParticipants.values()]
      .filter((p) => p && p.identity)
      .map((p) => ({
        id: p.identity,
        name: p.name || p.identity.split(':').pop(),
        me: p.identity === room.localParticipant.identity,
        muted: !p.isMicrophoneEnabled,
      }));
    setParticipants(people);
    setMic(Boolean(room.localParticipant?.isMicrophoneEnabled));
  }, []);

  const watchLocalMicTrack = useCallback((room) => {
    localTrackCleanupRef.current?.();
    localTrackCleanupRef.current = null;
    const pub = room?.localParticipant?.getTrackPublication(Track.Source.Microphone);
    const mediaTrack = pub?.track?.mediaStreamTrack;
    if (!mediaTrack) return;

    const handleEnded = () => {
      if (roomRef.current !== room) return;
      room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
      setMic(false);
      refreshParticipants(room);
      setWarning('El sistema detuvo tu micrófono (por ejemplo al cambiar de aplicación). Pulsa "ACTIVAR MICRO" para hablar de nuevo.');
    };

    mediaTrack.addEventListener('ended', handleEnded);
    localTrackCleanupRef.current = () => {
      mediaTrack.removeEventListener('ended', handleEnded);
    };
  }, [refreshParticipants]);

  async function enter() {
    if (connecting || connected) return;
    setConnecting(true);
    setReconnecting(false);
    setError('');
    setWarning('');
    manualExitRef.current = false;

    const room = new Room({
      adaptiveStream: false,
      dynacast: false,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    // En iOS/Safari, iniciar el contexto de audio dentro del clic inicial ayuda a evitar bloqueos.
    room.startAudio().catch(() => {});

    room.on(RoomEvent.ParticipantConnected, () => refreshParticipants(room));
    room.on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room));
    room.on(RoomEvent.TrackMuted, () => refreshParticipants(room));
    room.on(RoomEvent.TrackUnmuted, () => refreshParticipants(room));
    room.on(RoomEvent.LocalTrackPublished, () => {
      refreshParticipants(room);
      watchLocalMicTrack(room);
    });
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      localTrackCleanupRef.current?.();
      localTrackCleanupRef.current = null;
      refreshParticipants(room);
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (people) => {
      setSpeaking(people.map((p) => p.identity));
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      setAudioBlocked(!room.canPlaybackAudio);
    });
    room.on(RoomEvent.Reconnecting, () => {
      setReconnecting(true);
      setWarning('Conexión inestable, intentando reconectar...');
    });
    room.on(RoomEvent.Reconnected, () => {
      setReconnecting(false);
      setWarning('');
      refreshParticipants(room);
      setAudioBlocked(!room.canPlaybackAudio);
    });
    room.on(RoomEvent.MediaDevicesError, () => {
      setError('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    });
    room.on(RoomEvent.Disconnected, (reason) => {
      localTrackCleanupRef.current?.();
      localTrackCleanupRef.current = null;
      clearAudioElements();
      releaseWakeLock();
      setMediaSession(false);
      setConnected(false);
      setReconnecting(false);
      setMic(false);
      setAudioBlocked(false);
      setParticipants([]);
      setSpeaking([]);
      roomRef.current = null;

      if (!manualExitRef.current && reason !== DisconnectReason.CLIENT_INITIATED) {
        setError(disconnectMessage(reason));
      }
      manualExitRef.current = false;
    });
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.autoplay = true;
      element.setAttribute('playsinline', '');
      if (audioRef.current) audioRef.current.appendChild(element);
      refreshParticipants(room);
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach((el) => el.remove());
      refreshParticipants(room);
    });

    try {
      const { url, token } = await request('/api/voice/token', { method: 'POST' });
      await room.connect(url, token, { autoSubscribe: true });
      setConnected(true);
      setMediaSession(true);
      requestWakeLock();
      refreshParticipants(room);

      try {
        await room.startAudio();
        setAudioBlocked(!room.canPlaybackAudio);
      } catch {
        setAudioBlocked(true);
      }

      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setMic(true);
        watchLocalMicTrack(room);
      } catch {
        setMic(false);
        setWarning('Conectado en modo escucha: no se pudo activar el micrófono. Revisa el permiso y pulsa "ACTIVAR MICRO".');
      }
      refreshParticipants(room);
    } catch (e) {
      setError(e.message || 'No se pudo conectar a la sala de voz.');
      manualExitRef.current = true;
      await room.disconnect();
      clearAudioElements();
      releaseWakeLock();
      setMediaSession(false);
      roomRef.current = null;
      setConnected(false);
      setMic(false);
    } finally {
      setConnecting(false);
    }
  }

  async function toggleMicrophone() {
    const room = roomRef.current;
    if (!room) return;
    const nextState = !mic;
    try {
      await room.localParticipant.setMicrophoneEnabled(nextState);
      setMic(nextState);
      setError('');
      if (nextState) {
        setWarning('');
        watchLocalMicTrack(room);
      }
      refreshParticipants(room);
    } catch {
      setMic(false);
      setError('El navegador no permite usar el micrófono. Revisa los permisos.');
    }
  }

  async function enableAudio() {
    try {
      await roomRef.current?.startAudio();
      setAudioBlocked(!roomRef.current?.canPlaybackAudio);
      setError('');
    } catch {
      setError('Activa el sonido o verifica los permisos del navegador.');
    }
  }

  function exit() {
    manualExitRef.current = true;
    localTrackCleanupRef.current?.();
    localTrackCleanupRef.current = null;
    roomRef.current?.disconnect();
    roomRef.current = null;
    clearAudioElements();
    releaseWakeLock();
    setMediaSession(false);
    setConnected(false);
    setReconnecting(false);
    setMic(false);
    setAudioBlocked(false);
    setParticipants([]);
    setSpeaking([]);
    setWarning('');
  }

  useEffect(() => {
    function handleVisibilityChange() {
      const room = roomRef.current;
      if (!room || document.visibilityState !== 'visible') return;
      requestWakeLock();
      setAudioBlocked(!room.canPlaybackAudio);

      const pub = room.localParticipant?.getTrackPublication(Track.Source.Microphone);
      const mediaTrack = pub?.track?.mediaStreamTrack;
      if (mediaTrack && mediaTrack.readyState === 'ended') {
        room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        setMic(false);
        refreshParticipants(room);
        setWarning('El sistema pausó el micrófono mientras estabas en otra aplicación. Pulsa "ACTIVAR MICRO" para volver a hablar.');
      } else {
        refreshParticipants(room);
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      manualExitRef.current = true;
      localTrackCleanupRef.current?.();
      roomRef.current?.disconnect();
      roomRef.current = null;
      clearAudioElements();
      releaseWakeLock();
      setMediaSession(false);
    };
  }, [clearAudioElements, refreshParticipants, releaseWakeLock, requestWakeLock, setMediaSession]);

  const pillClass = reconnecting ? 'pill reconnecting' : connected ? 'pill online' : 'pill';
  const pillText = reconnecting ? 'RECONECTANDO' : connected ? 'CONECTADO' : 'DESCONECTADO';

  return (
    <section className="panel voice-panel">
      <div className="section-bar">
        <div>
          <span className="eyebrow">CANAL DE VOZ</span>
          <h2>Sala principal</h2>
        </div>
        <span className={pillClass}><span className="status-dot" />{pillText}</span>
      </div>

      <div className="room-banner">
        <span className="room-symbol">♫</span>
        <div>
          <strong>Realms • General</strong>
          <small>{connected ? `${participants.length} en la sala` : 'Una sala para hablar mientras juegan'}</small>
        </div>
      </div>

      {!connected ? (
        <button className="button primary full" onClick={enter} disabled={connecting}>
          {connecting ? 'CONECTANDO...' : 'ENTRAR A LA SALA DE VOZ'}
        </button>
      ) : (
        <>
          <div className="participants">
            <div className="small-heading">JUGADORES CONECTADOS ({participants.length})</div>
            <div className="avatar-list">
              {participants.map((p, i) => {
                const isSpeaking = speaking.includes(p.id);
                return (
                  <div key={p.id} className="player">
                    <div className={'avatar tone-' + (i % 5)}>{p.name.substring(0, 1).toUpperCase()}</div>
                    <span className="player-name">{p.name}{p.me ? ' (Tú)' : ''}</span>
                    {isSpeaking && <span className="speaking">HABLANDO</span>}
                    {!isSpeaking && p.muted && <span className="muted-tag">SILENCIADO</span>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="voice-actions">
            <button className={'button ' + (mic ? 'soft' : 'warn')} onClick={toggleMicrophone}>
              {mic ? 'SILENCIAR MICRO' : 'ACTIVAR MICRO'}
            </button>
            <button className="button danger" onClick={exit}>SALIR</button>
          </div>

          {audioBlocked && (
            <button className="button soft full" onClick={enableAudio}>
              ACTIVAR SONIDO DE LOS DEMÁS
            </button>
          )}
        </>
      )}

      {warning && <div className="alert warn" role="status">{warning}</div>}
      {error && <div className="alert error" role="alert">{error}</div>}
      <div ref={audioRef} className="audio-container" aria-hidden="true" />
      <p className="notice">
        <strong>Importante en teléfono:</strong> al cambiar a Minecraft, Android o iPhone pueden suspender el micrófono del navegador. Prueba con dos teléfonos antes de usarlo en una partida.
      </p>
    </section>
  );
}

function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const data = await request('/api/admin/users');
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await request('/api/admin/users', {
        method: 'POST',
        body: { username: username.trim().toLowerCase(), password },
      });
      setSuccess('Cuenta creada. Comparte los datos con tu amigo de forma privada.');
      setUsername('');
      setPassword('');
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveReset(e, name) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await request('/api/admin/users/' + encodeURIComponent(name), {
        method: 'PATCH',
        body: { password: newPassword },
      });
      setSuccess('Contraseña cambiada para ' + name);
      setEditingUser(null);
      setNewPassword('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(name) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await request('/api/admin/users/' + encodeURIComponent(name), { method: 'DELETE' });
      setSuccess('Cuenta eliminada: ' + name);
      setConfirmDelete(null);
      if (editingUser === name) {
        setEditingUser(null);
        setNewPassword('');
      }
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel admin-panel">
      <div className="section-bar">
        <div>
          <span className="eyebrow">SOLO ADMINISTRADOR</span>
          <h2>Jugadores</h2>
        </div>
        <span className="count">{users.length}/10</span>
      </div>
      <p>Crea los accesos y entrega a cada amigo su usuario y contraseña. Ellos no pueden registrarse.</p>

      <form onSubmit={create} className="admin-form">
        <div>
          <label htmlFor="new-name">NUEVO USUARIO</label>
          <input
            id="new-name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="steve"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="[A-Za-z0-9_-]{3,20}"
            title="De 3 a 20 caracteres: letras, números, guion o guion bajo"
            required
          />
        </div>
        <div>
          <label htmlFor="new-pass">CONTRASEÑA</label>
          <input
            id="new-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            minLength={8}
            maxLength={128}
            required
          />
        </div>
        <button className="button primary" disabled={busy || users.length >= 10}>
          {busy ? 'GUARDANDO...' : 'CREAR CUENTA'}
        </button>
      </form>

      {error && <div className="alert error" role="alert">{error}</div>}
      {success && <div className="alert success" role="status">{success}</div>}

      <div className="small-heading">CUENTAS CREADAS</div>
      {users.length === 0 ? (
        <p className="empty">Aún no hay jugadores registrados.</p>
      ) : (
        <div className="account-list">
          {users.map((u, i) => (
            <div className="account" key={u.username}>
              <div className="account-row">
                <div className={'avatar tone-' + (i % 5)}>{u.username[0]?.toUpperCase()}</div>
                <span className="account-name">{u.username}</span>
                {confirmDelete === u.username ? (
                  <>
                    <button
                      className="small-button remove"
                      type="button"
                      disabled={busy}
                      onClick={() => remove(u.username)}
                    >
                      CONFIRMAR BORRADO
                    </button>
                    <button
                      className="small-button"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDelete(null)}
                    >
                      CANCELAR
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="small-button"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirmDelete(null);
                        setEditingUser(editingUser === u.username ? null : u.username);
                        setNewPassword('');
                      }}
                    >
                      CAMBIAR CLAVE
                    </button>
                    <button
                      className="small-button remove"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditingUser(null);
                        setConfirmDelete(u.username);
                      }}
                    >
                      ELIMINAR
                    </button>
                  </>
                )}
              </div>

              {editingUser === u.username && (
                <form className="inline-edit" onSubmit={(e) => saveReset(e, u.username)}>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={`Nueva clave para ${u.username} (mín. 8)`}
                    minLength={8}
                    maxLength={128}
                    required
                    autoFocus
                  />
                  <button className="small-button primary" type="submit" disabled={busy}>
                    GUARDAR
                  </button>
                  <button
                    className="small-button"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingUser(null);
                      setNewPassword('');
                    }}
                  >
                    CANCELAR
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    request('/api/auth/me')
      .then((d) => setUser(d.user || null))
      .catch(() => setUser(null));
  }, []);

  async function logout() {
    await request('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }

  if (user === undefined) {
    return (
      <main className="center-layout">
        <div className="loading">CARGANDO REALMS VOZ...</div>
      </main>
    );
  }

  if (!user) return <Login onLogin={setUser} />;

  return (
    <main className="app-layout">
      <header className="topbar">
        <Logo />
        <div className="header-right">
          <span className="user-chip">{user.username}</span>
          <button className="logout" onClick={logout}>CERRAR SESIÓN</button>
        </div>
      </header>

      <div className="page-content">
        <div className="page-intro">
          <span className="eyebrow">SERVIDOR PRIVADO</span>
          <h1>Tu grupo. Una sola sala.</h1>
          <p>Conecta el micrófono para hablar con los demás jugadores.</p>
        </div>
        <div className="content-grid">
          <VoiceRoom />
          {user.role === 'admin' ? (
            <AdminPanel />
          ) : (
            <section className="panel tips">
              <div className="eyebrow">CONSEJO</div>
              <h2>Jueguen sin complicaciones.</h2>
              <p>Usen audífonos para evitar eco. Si Minecraft interrumpe la voz, vuelvan al navegador para comprobar la conexión.</p>
              <div className="block-accent" />
            </section>
          )}
        </div>
      </div>

      <footer className="footer">REALMS VOZ · HECHO PARA UN GRUPO DE 10 AMIGOS</footer>
    </main>
  );
}
