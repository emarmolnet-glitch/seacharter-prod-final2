import React, { useEffect, useMemo } from "react";
import { voyageStore } from "../stores/voyage-store.js";
import "./MaritimeWeatherPanel.css";

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizePort(port) {
  if (!port) return null;
  if (typeof port === "string") return { name: port.trim() };
  const name = String(port.name || port.id || "").trim();
  return name ? { ...port, name } : null;
}

function parseDateAtUtcStart(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? new Date(`${text}T00:00:00.000Z`)
    : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hashText(value) {
  return Array.from(String(value || "")).reduce(
    (hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0,
    2166136261,
  );
}

function buildPortWeather(port, role, mode, targetDate) {
  const seed = hashText(`${role}:${port.name}:${targetDate?.getUTCMonth() ?? 0}`);
  const seasonalOffset = targetDate ? Math.sin(((targetDate.getUTCMonth() + 1) / 12) * Math.PI * 2) : 0;
  const temperatureC = mode === "short-term"
    ? Math.round(13 + (seed % 16) + seasonalOffset * 3)
    : Math.round(15 + (seed % 11) + seasonalOffset * 4);
  const windKnots = mode === "short-term"
    ? 8 + (seed % 18)
    : 10 + (seed % 10);
  const operationalStatus = windKnots >= 23
    ? "Precaución"
    : mode === "seasonal"
      ? "Promedio operativo"
      : "Normal";

  return {
    role,
    portName: port.name,
    temperatureC,
    windKnots,
    operationalStatus,
    condition: windKnots >= 23 ? "Viento fresco" : windKnots >= 16 ? "Brisa moderada" : "Ventana estable",
  };
}

export function buildMaritimeWeatherSnapshot({ pol, pod, laydays, cancelling }, now = new Date()) {
  const normalizedPol = normalizePort(pol);
  const normalizedPod = normalizePort(pod);
  if (!normalizedPol && !normalizedPod) return null;

  const laydaysDate = parseDateAtUtcStart(laydays);
  const cancellingDate = parseDateAtUtcStart(cancelling);
  const targetDate = laydaysDate || cancellingDate;
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rawDaysUntil = targetDate ? Math.ceil((targetDate.getTime() - todayUtc.getTime()) / DAY_MS) : null;
  const daysUntilLaycan = Number.isFinite(rawDaysUntil) ? Math.max(0, rawDaysUntil) : null;
  const mode = daysUntilLaycan !== null && daysUntilLaycan <= 10 ? "short-term" : "seasonal";

  return {
    source: mode === "short-term" ? "mock-short-term-forecast" : "mock-seasonal-climatology",
    mode,
    targetDate: targetDate?.toISOString().slice(0, 10) || "",
    laydays: String(laydays || ""),
    cancelling: String(cancelling || ""),
    daysUntilLaycan,
    ports: {
      pol: normalizedPol ? buildPortWeather(normalizedPol, "POL", mode, targetDate) : null,
      pod: normalizedPod ? buildPortWeather(normalizedPod, "POD", mode, targetDate) : null,
    },
  };
}

function WeatherIcon({ mode }) {
  return mode === "short-term" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.1 8.8 4.6 4.6 0 0 0 7 18Z" />
      <path d="M8 21h6M15.5 21H18" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function WeatherCard({ weather, role, mode, daysUntilLaycan }) {
  const isShortTerm = mode === "short-term";
  return (
    <article className={`maritime-weather-card maritime-weather-card--${role.toLowerCase()}`}>
      <div className="maritime-weather-card__rail" aria-hidden="true" />
      <header className="maritime-weather-card__header">
        <div>
          <span className="maritime-weather-card__role">{role}</span>
          <h3 title={weather.portName}>{weather.portName}</h3>
        </div>
        <span className="maritime-weather-card__icon"><WeatherIcon mode={mode} /></span>
      </header>

      <div className="maritime-weather-card__mode">
        <span>{isShortTerm ? "Previsión a Corto Plazo" : "Climatología Estacional"}</span>
        <small>
          {isShortTerm && daysUntilLaycan !== null
            ? `Laycan en ${daysUntilLaycan} d`
            : "Promedios históricos"}
        </small>
      </div>

      <dl className="maritime-weather-card__metrics">
        <div>
          <dt>Temperatura</dt>
          <dd>{weather.temperatureC}°<span>C</span></dd>
        </div>
        <div>
          <dt>Viento</dt>
          <dd>{weather.windKnots}<span> kn</span></dd>
        </div>
      </dl>

      <footer className="maritime-weather-card__status">
        <span className={`maritime-weather-card__signal ${weather.operationalStatus === "Precaución" ? "is-caution" : ""}`} />
        <div>
          <small>Estado operativo</small>
          <strong>{weather.operationalStatus}</strong>
        </div>
        <em>{weather.condition}</em>
      </footer>
    </article>
  );
}

export default function MaritimeWeatherPanel({ pol, pod, laydays, cancelling }) {
  const snapshot = useMemo(
    () => buildMaritimeWeatherSnapshot({ pol, pod, laydays, cancelling }),
    [pol, pod, laydays, cancelling],
  );

  useEffect(() => {
    voyageStore.getState().setWeatherSnapshot(snapshot);
  }, [snapshot]);

  if (!snapshot) return null;

  return (
    <aside className="maritime-weather-panel" aria-label="Previsión marítima de puertos">
      {snapshot.ports.pol && (
        <WeatherCard
          weather={snapshot.ports.pol}
          role="POL"
          mode={snapshot.mode}
          daysUntilLaycan={snapshot.daysUntilLaycan}
        />
      )}
      {snapshot.ports.pod && (
        <WeatherCard
          weather={snapshot.ports.pod}
          role="POD"
          mode={snapshot.mode}
          daysUntilLaycan={snapshot.daysUntilLaycan}
        />
      )}
      <p className="maritime-weather-panel__disclaimer">Simulación operativa · no sustituye parte meteorológico</p>
    </aside>
  );
}
