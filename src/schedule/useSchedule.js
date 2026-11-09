import { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchSchedule, saveShifts, saveMember } from './api.js';

// Shared schedule state for Horario equipo (read/write) and Vista mensual
// (read-only). Each page loads the Schedule tab on its own; writes are
// optimistic and roll back if the Apps Script call fails.

export const cellKey = (date, member) => `${date}|${member.toLowerCase()}`;

function pad2(n) { return String(n).padStart(2, '0'); }
export function ymd(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }

export function shiftHours(s) {
  if (!s || s.kind !== 'turno' || !s.start || !s.end) return 0;
  const [h1, m1] = s.start.split(':').map(Number);
  const [h2, m2] = s.end.split(':').map(Number);
  let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (mins < 0) mins += 24 * 60; // overnight
  return mins / 60;
}

export function fmtHours(h) {
  if (!h) return '0 h';
  return `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`;
}

export default function useSchedule(hubspotUrl, hubspotKey) {
  const [roster, setRoster] = useState([]);
  const [shifts, setShifts] = useState({});   // cellKey → shift
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(0);

  const reload = useCallback(async () => {
    if (!hubspotUrl) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchSchedule(hubspotUrl, hubspotKey);
      const map = {};
      for (const s of data.shifts) map[cellKey(s.date, s.member)] = s;
      setShifts(map);
      setRoster(data.roster);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [hubspotUrl, hubspotKey]);

  useEffect(() => { reload(); }, [reload]);

  const getShift = useCallback((date, member) => shifts[cellKey(date, member)] || null, [shifts]);

  // Roster plus anyone holding a shift in the given month prefix ("2026-11-").
  const membersFor = useCallback((monthPrefix) => {
    const seen = new Map();
    for (const m of roster) if (!seen.has(m.toLowerCase())) seen.set(m.toLowerCase(), m);
    for (const s of Object.values(shifts)) {
      if (s.date.startsWith(monthPrefix) && !seen.has(s.member.toLowerCase())) seen.set(s.member.toLowerCase(), s.member);
    }
    return [...seen.values()];
  }, [roster, shifts]);

  /** items: [{ date, member, shift|null }] — one request for all of them. */
  const writeShifts = useCallback(async (items) => {
    if (!items.length) return;
    let prev = {};
    setShifts((cur) => {
      prev = cur;
      const next = { ...cur };
      for (const { date, member, shift } of items) {
        const k = cellKey(date, member);
        if (shift) next[k] = { ...shift, date, member }; else delete next[k];
      }
      return next;
    });
    setSaving((n) => n + 1);
    try {
      await saveShifts(hubspotUrl, hubspotKey, items);
    } catch (e) {
      setError(`No se pudo guardar: ${e.message || e}`);
      setShifts((cur) => {
        const next = { ...cur };
        for (const { date, member } of items) {
          const k = cellKey(date, member);
          if (prev[k]) next[k] = prev[k]; else delete next[k];
        }
        return next;
      });
    } finally {
      setSaving((n) => n - 1);
    }
  }, [hubspotUrl, hubspotKey]);

  const writeShift = useCallback((date, member, shift) => writeShifts([{ date, member, shift }]), [writeShifts]);

  const addMember = useCallback(async (name) => {
    setRoster((r) => [...r, name]);
    setSaving((n) => n + 1);
    try { await saveMember(hubspotUrl, hubspotKey, name); }
    catch (e) {
      setError(`No se pudo añadir a ${name}: ${e.message || e}`);
      setRoster((r) => r.filter((m) => m !== name));
    } finally { setSaving((n) => n - 1); }
  }, [hubspotUrl, hubspotKey]);

  const removeMember = useCallback(async (name) => {
    let prev = [];
    setRoster((r) => { prev = r; return r.filter((m) => m.toLowerCase() !== name.toLowerCase()); });
    setSaving((n) => n + 1);
    try { await saveMember(hubspotUrl, hubspotKey, name, true); }
    catch (e) {
      setError(`No se pudo quitar a ${name}: ${e.message || e}`);
      setRoster(prev);
    } finally { setSaving((n) => n - 1); }
  }, [hubspotUrl, hubspotKey]);

  return useMemo(() => ({
    roster, shifts, loading, error, setError, saving,
    reload, getShift, membersFor, writeShift, writeShifts, addMember, removeMember,
  }), [roster, shifts, loading, error, saving, reload, getShift, membersFor, writeShift, writeShifts, addMember, removeMember]);
}
