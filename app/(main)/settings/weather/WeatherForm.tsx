'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, BookmarkCheck, CheckCircle, Loader2, MapPin, Navigation, Search, Trash2, X } from 'lucide-react';
import { saveWeatherConfig, toggleWeatherEnabled, verifyWeatherLocation } from './actions';
import type { WeatherConfigStatus, WeatherLocationVerification } from '@/lib/weather';
import {
  findQWeatherLocation,
  QWEATHER_LOCATION_GROUPS,
} from '@/lib/qweatherLocations';

type SelectedLocation = { province: string; city: string; district: string; id: string };
type WeatherProfile = { name: string; host: string; locationId: string; display: string };
type Props = { status: WeatherConfigStatus };

const PROFILES_KEY = 'clockin_weather_profiles';

function loadProfiles(): WeatherProfile[] {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? '[]') as WeatherProfile[]; }
  catch { return []; }
}
function saveProfiles(profiles: WeatherProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

const TUTORIAL_STEPS = [
  { step: '1', title: '注册账号', body: '访问 id.qweather.com 注册和风天气账号。免费版每天可调用 1,000 次，满足打卡场景。' },
  { step: '2', title: '创建项目', body: '登录控制台 → 点击「新建项目」→ 订阅类型选择「免费订阅」→ 保存。' },
  { step: '3', title: '获取 API Key', body: '进入项目详情页，点击「新建 Key」→ 类型选 Web API → 复制生成的密钥。' },
  { step: '4', title: '填入配置', body: '将密钥粘贴到「API Key」输入框，搜索并选择工厂所在城市，点击「保存」。' },
];

function TutorialSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div className="max-h-[78vh] w-full overflow-y-auto rounded-t-2xl bg-white px-5 pb-10 pt-5" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold text-gray-800">如何接入和风天气</h2>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F0F4FA] text-gray-400"><X size={16} /></button>
        </div>
        <div className="space-y-5">
          {TUTORIAL_STEPS.map(s => (
            <div key={s.step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3370FF] text-[12px] font-semibold text-white">{s.step}</span>
              <div>
                <div className="text-[14px] font-medium text-gray-800">{s.title}</div>
                <div className="mt-0.5 text-[13px] leading-5 text-gray-500">{s.body}</div>
              </div>
            </div>
          ))}
          <div className="rounded-xl bg-[#F0F4FA] px-4 py-3 text-[12px] leading-5 text-gray-400">
            遇到 401 请确认 Key 复制完整；遇到 404 请重新搜索选择城市。
          </div>
        </div>
      </div>
    </div>
  );
}

type GeoStatus = 'idle' | 'detecting' | 'found' | 'denied' | 'unavailable' | 'error';

function normalizeName(s: string): string {
  return s.replace(/[省市区县镇乡街道自治州盟旗]/g, '').trim();
}

export default function WeatherForm({ status }: Props) {
  const initialLocation = status.source === 'db' ? findQWeatherLocation(status.locationId) : null;

  const [enabled, setEnabled] = useState(status.enabled);
  const [key, setKey] = useState('');
  const [apiHost, setApiHost] = useState(status.source === 'db' ? status.apiHost : '');
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(initialLocation);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<WeatherLocationVerification | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isPending, startTransition] = useTransition();
  const [isTogglePending, startToggleTransition] = useTransition();
  const [profiles, setProfiles] = useState<WeatherProfile[]>([]);
  const [saveProfileName, setSaveProfileName] = useState('');
  const [showSaveProfile, setShowSaveProfile] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => { setProfiles(loadProfiles()); }, []);

  const flatItems = useMemo<SelectedLocation[]>(() => {
    const result: SelectedLocation[] = [];
    for (const province of QWEATHER_LOCATION_GROUPS) {
      for (const city of province.cities) {
        for (const item of city.items) {
          result.push({ province: province.name, city: city.name, district: item.name, id: item.id });
        }
      }
    }
    return result;
  }, []);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    return flatItems.filter(item => item.district.includes(q) || item.city.includes(q) || item.province.includes(q)).slice(0, 12);
  }, [flatItems, searchQuery]);

  useEffect(() => {
    if (status.source !== 'none') return;
    if (!('geolocation' in navigator)) { setGeoStatus('unavailable'); return; }
    setGeoStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=zh`,
            { headers: { 'Accept-Language': 'zh' } },
          );
          const data = await res.json() as { address?: Record<string, string> };
          const addr = data.address ?? {};
          const county = addr.county ?? addr.city_district ?? addr.suburb ?? '';
          const cityName = addr.city ?? addr.town ?? addr.village ?? '';
          const state = addr.state ?? '';
          const n = normalizeName;
          const match =
            flatItems.find(i => i.district === n(county)) ??
            flatItems.find(i => i.district === n(cityName)) ??
            flatItems.find(i => n(i.city) === n(cityName)) ??
            flatItems.find(i => n(i.province) === n(state)) ?? null;
          if (match) { setSelectedLocation(match); setGeoStatus('found'); }
          else setGeoStatus('error');
        } catch { setGeoStatus('error'); }
      },
      () => setGeoStatus('denied'),
      { timeout: 10000 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    startToggleTransition(async () => {
      const result = await toggleWeatherEnabled(next);
      if (!result.ok) { setEnabled(!next); setError(result.error); }
      else router.refresh();
    });
  };

  const handleSelectLocation = (item: SelectedLocation) => {
    setSelectedLocation(item); setSearchQuery(''); setShowDropdown(false); setVerified(null); setError('');
  };

  const handleVerify = async () => {
    setError(''); setInfo(''); setVerified(null);
    if (!selectedLocation) { setError('请先搜索并选择城市'); return; }
    if (!key.trim() && !status.hasKey) { setError('请先填写 API Key'); return; }
    setVerifying(true);
    try {
      const result = await verifyWeatherLocation({ key: key.trim() || undefined, locationId: selectedLocation.id, host: apiHost.trim() || undefined });
      if (result.ok) { setVerified(result.location); setInfo(`验证成功：${result.location.name} · ${result.location.adm2} · ${result.location.adm1}`); }
      else setError(result.error);
    } finally { setVerifying(false); }
  };

  const handleSave = () => {
    setError(''); setInfo('');
    if (!key.trim() && !status.hasKey) { setError('请先填写 API Key'); return; }
    if (!selectedLocation) { setError('请搜索并选择城市'); return; }
    startTransition(async () => {
      const result = await saveWeatherConfig({ key: key.trim() || undefined, locationId: selectedLocation.id, city: selectedLocation.district, host: apiHost.trim() || undefined });
      if (result.ok) { setInfo('保存成功'); setKey(''); router.refresh(); }
      else setError(result.error);
    });
  };

  const handleSaveProfile = () => {
    const name = saveProfileName.trim();
    if (!name) return;
    if (!selectedLocation && !apiHost.trim()) return;
    const display = selectedLocation
      ? `${selectedLocation.district} · ${selectedLocation.province !== selectedLocation.city ? selectedLocation.province + ' / ' + selectedLocation.city : selectedLocation.province}`
      : '';
    const updated = [...profiles.filter(p => p.name !== name), { name, host: apiHost.trim(), locationId: selectedLocation?.id ?? '', display }];
    saveProfiles(updated); setProfiles(updated); setShowSaveProfile(false); setSaveProfileName('');
  };

  const handleLoadProfile = (p: WeatherProfile) => {
    if (p.host) setApiHost(p.host);
    if (p.locationId) {
      const loc = findQWeatherLocation(p.locationId);
      if (loc) setSelectedLocation(loc);
    }
    setVerified(null); setError('');
  };

  const handleDeleteProfile = (name: string) => {
    const updated = profiles.filter(p => p.name !== name);
    saveProfiles(updated); setProfiles(updated);
  };

  const locationContext = (loc: SelectedLocation) =>
    loc.province !== loc.city ? `${loc.province} · ${loc.city}` : loc.province;

  // Status subtitle for the toggle card
  const statusSubtitle = (() => {
    if (!enabled) return '已关闭';
    if (!status.hasKey) return '未配置，请填写 API Key';
    const city = initialLocation?.district ?? status.city;
    const host = status.apiHost || 'devapi.qweather.com';
    if (city) return `${city} · ${host}`;
    return '已配置，位置待设置';
  })();

  return (
    <div className="space-y-3">
      {/* ── Toggle card ── */}
      <div className="rounded-2xl bg-white shadow-sm">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isTogglePending}
          className="flex w-full items-center justify-between px-4 py-4 text-left disabled:opacity-60"
        >
          <div>
            <div className="text-[15px] font-medium text-gray-800">天气功能</div>
            <div className="mt-0.5 text-[12px] text-gray-400">{statusSubtitle}</div>
          </div>
          <span className={`relative h-7 w-[52px] shrink-0 rounded-full transition-colors ${enabled ? 'bg-[#3370FF]' : 'bg-gray-200'}`}>
            <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-0'}`} />
          </span>
        </button>
      </div>

      {enabled && (
        <>
          {/* ── Profiles ── */}
          {profiles.length > 0 && (
            <div className="rounded-2xl bg-white px-4 py-3 shadow-sm">
              <div className="mb-2 text-[13px] text-gray-500">已保存方案</div>
              <div className="flex flex-wrap gap-2">
                {profiles.map(p => (
                  <div key={p.name} className="flex items-center gap-1 rounded-full bg-[#F0F4FA] pl-3 pr-1 py-1">
                    <button type="button" onClick={() => handleLoadProfile(p)} className="text-[13px] font-medium text-[#1A3A8F]">
                      {p.name}
                    </button>
                    <button type="button" onClick={() => handleDeleteProfile(p.name)} className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 hover:text-red-400">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Config form ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-[15px] font-medium text-gray-800">和风天气 API</span>
              <button type="button" onClick={() => setShowTutorial(true)} className="rounded-full bg-[#EBF0FF] px-3 py-1 text-[12px] font-medium text-[#3370FF]">接入教程</button>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-[13px] text-gray-500">API Key</span>
                <input type="password" value={key} onChange={e => setKey(e.target.value)} autoComplete="off"
                  placeholder={status.hasKey ? '输入新 Key 才会覆盖' : '粘贴 API Key'}
                  className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[14px] text-gray-800 outline-none" />
              </label>

              <label className="grid gap-1.5">
                <span className="text-[13px] text-gray-500">API Host</span>
                <input type="text" value={apiHost} onChange={e => setApiHost(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="devapi.qweather.com"
                  className="h-11 rounded-xl bg-[#F0F4FA] px-3 text-[13px] text-gray-800 outline-none placeholder:text-gray-400" />
              </label>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-gray-500">城市</span>
                  {geoStatus === 'detecting' && <span className="flex items-center gap-1 text-[12px] text-gray-400"><Loader2 size={12} className="animate-spin" />定位中…</span>}
                  {geoStatus === 'found' && <span className="flex items-center gap-1 text-[12px] text-[#3370FF]"><Navigation size={12} />已根据定位预选</span>}
                  {geoStatus === 'denied' && <span className="text-[12px] text-gray-400">定位权限已拒绝</span>}
                </div>
                {selectedLocation ? (
                  <div className="flex h-11 items-center justify-between rounded-xl bg-[#F0F4FA] px-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin size={15} className="shrink-0 text-[#3370FF]" />
                      <span className="shrink-0 text-[14px] font-medium text-gray-800">{selectedLocation.district}</span>
                      <span className="truncate text-[12px] text-gray-400">{locationContext(selectedLocation)}</span>
                    </div>
                    <button type="button" onClick={() => { setSelectedLocation(null); setVerified(null); setError(''); setGeoStatus('idle'); }}
                      className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div ref={searchRef} className="relative">
                    <div className="flex h-11 items-center gap-2 rounded-xl bg-[#F0F4FA] px-3">
                      <Search size={15} className="shrink-0 text-gray-400" />
                      <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setShowDropdown(true); }}
                        onFocus={() => { if (searchQuery) setShowDropdown(true); }}
                        placeholder="搜索城市、区县"
                        className="flex-1 bg-transparent text-[14px] text-gray-800 outline-none placeholder:text-gray-400" />
                      {searchQuery && <button type="button" onClick={() => { setSearchQuery(''); setShowDropdown(false); }} className="text-gray-400"><X size={14} /></button>}
                    </div>
                    {showDropdown && searchQuery.trim() && searchResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5">
                        {searchResults.map(item => (
                          <button key={item.id} type="button" onMouseDown={e => { e.preventDefault(); handleSelectLocation(item); }}
                            className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#F0F4FA]">
                            <span className="text-[14px] font-medium text-gray-800">{item.district}</span>
                            <span className="ml-4 shrink-0 text-[12px] text-gray-400">{locationContext(item)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {showDropdown && searchQuery.trim() && searchResults.length === 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-black/5">
                        <span className="text-[13px] text-gray-400">未找到「{searchQuery.trim()}」</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {verified && (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2.5">
                <CheckCircle size={15} className="shrink-0 text-green-500" />
                <span className="text-[12px] text-green-700">{info}</span>
              </div>
            )}
            {error && <div className="mt-3"><p className="text-[13px] text-red-500">{error}</p></div>}
            {info && !error && !verified && <div className="mt-3"><p className="text-[13px] text-[#3370FF]">{info}</p></div>}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => void handleVerify()} disabled={verifying || isPending}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#F0F4FA] text-[14px] font-semibold text-[#1A3A8F] disabled:opacity-40">
                {verifying ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
                验证
              </button>
              <button type="button" onClick={handleSave} disabled={isPending || verifying}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#3370FF] text-[14px] font-semibold text-white shadow-sm disabled:opacity-40">
                {isPending ? <Loader2 size={16} className="animate-spin" /> : '保存'}
              </button>
            </div>

            {/* Save profile */}
            <div className="mt-3 border-t border-[#F0F4FA] pt-3">
              {showSaveProfile ? (
                <div className="flex gap-2">
                  <input value={saveProfileName} onChange={e => setSaveProfileName(e.target.value)}
                    placeholder="方案名称，如「生产环境」"
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveProfile(); if (e.key === 'Escape') setShowSaveProfile(false); }}
                    autoFocus
                    className="h-9 flex-1 rounded-xl bg-[#F0F4FA] px-3 text-[13px] text-gray-800 outline-none" />
                  <button type="button" onClick={handleSaveProfile} className="flex h-9 items-center rounded-xl bg-[#3370FF] px-4 text-[13px] font-medium text-white">保存</button>
                  <button type="button" onClick={() => setShowSaveProfile(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0F4FA] text-gray-400"><X size={14} /></button>
                </div>
              ) : (
                <button type="button" onClick={() => setShowSaveProfile(true)}
                  className="flex items-center gap-1.5 text-[13px] text-gray-400 hover:text-[#3370FF]">
                  <Bookmark size={14} />
                  另存为方案
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {showTutorial && <TutorialSheet onClose={() => setShowTutorial(false)} />}
    </div>
  );
}
