import { ChevronLeft, ChevronRight, X } from './icons';
import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { dateKey, people, today } from './data';
import type { Person } from './data';

export const PeopleContext = createContext<Person[]>(people);

export function Avatar({ id, small = false }: { id: string; small?: boolean }) {
  const person = useContext(PeopleContext).find(p => p.id === id);
  return <span className={`avatar ${person?.color || 'sage'} ${small ? 'small' : ''}`} title={person?.name || '未分配'}>{person?.name.slice(-1) || '？'}</span>;
}
export function Modal({ title, subtitle, children, onClose, wide = false, suspended = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean; suspended?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!suspended) dialog?.showModal();
    return () => dialog?.close();
  }, [suspended]);
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <header className="modal-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="关闭弹窗"><X size={20} /></button></header>
    {children}
  </dialog>;
}
export function MonthCalendar({ month, selected, dates, onMonth, onSelect, compact = false }: { month: Date; selected: string; dates: string[]; onMonth: (d: Date) => void; onSelect: (d: string) => void; compact?: boolean }) {
  const year = month.getFullYear(), m = month.getMonth();
  const start = (new Date(year, m, 1).getDay() + 6) % 7;
  const count = new Date(year, m + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((start + count) / 7) * 7 }, (_, i) => {
    const date = new Date(year, m, i - start + 1);
    const key = dateKey(date);
    return { date, key, other: date.getMonth() !== m };
  });
  return <div className={`month-calendar ${compact ? 'compact' : ''}`}>
    <div className="month-heading"><strong>{year}年 <span>{m + 1}月</span></strong><div className="inline-actions"><button className="icon-button" aria-label="上个月" onClick={() => onMonth(new Date(year, m - 1, 1))}><ChevronLeft size={17} /></button><button className="icon-button" aria-label="下个月" onClick={() => onMonth(new Date(year, m + 1, 1))}><ChevronRight size={17} /></button></div></div>
    <div className="calendar-grid weekdays">{['一', '二', '三', '四', '五', '六', '日'].map(d => <span key={d}>{d}</span>)}</div>
    <div className="calendar-grid days">{cells.map(({ date, key, other }) => <button key={key} aria-label={key} aria-pressed={selected === key} className={`${other ? 'other-month' : ''} ${key === today ? 'is-today' : ''} ${key === selected ? 'selected' : ''} ${dates.includes(key) ? 'has-record' : ''}`} onClick={() => { onSelect(key); if (other) onMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }}><span>{date.getDate()}</span>{dates.includes(key) && <i />}</button>)}</div>
  </div>;
}
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
