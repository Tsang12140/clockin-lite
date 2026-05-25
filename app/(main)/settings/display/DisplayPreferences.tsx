'use client';

import { useEffect, useState } from 'react';

const FONT_OPTIONS = [
  { value: 0, label: '标准', desc: '默认显示密度' },
  { value: 1, label: '较大', desc: '姓名和工时稍大' },
  { value: 2, label: '大', desc: '适合远距离查看' },
  { value: 3, label: '超大', desc: '最大考勤卡片字号' },
];

export default function DisplayPreferences() {
  const [fontLevel, setFontLevel] = useState(0);

  useEffect(() => {
    const next = Number.parseInt(localStorage.getItem('clockin_fontsize') ?? '0', 10);
    setFontLevel(Number.isFinite(next) ? next : 0);
  }, []);

  const chooseFontLevel = (level: number) => {
    setFontLevel(level);
    localStorage.setItem('clockin_fontsize', String(level));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 text-[15px] font-semibold text-gray-800">考勤卡片字号</div>
        <div className="grid grid-cols-2 gap-2">
          {FONT_OPTIONS.map(option => {
            const active = fontLevel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseFontLevel(option.value)}
                className={`rounded-2xl border px-3 py-3 text-left transition ${
                  active
                    ? 'border-[#3370FF] bg-[#F7FAFF]'
                    : 'border-gray-100 bg-white active:bg-[#F8FAFD]'
                }`}
              >
                <div className="text-[15px] font-semibold text-gray-800">{option.label}</div>
                <div className="mt-0.5 text-[12px] text-gray-400">{option.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="text-[12px] font-medium text-gray-400">预览</div>
        <div className="mt-3 rounded-2xl bg-[#F8FAFF] p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold text-gray-800">林芳</div>
              <div className="mt-0.5 text-[12px] text-gray-400">今日工时</div>
            </div>
            <div className={`font-bold text-[#1A3A8F] ${
              fontLevel === 0 ? 'text-[22px]' : fontLevel === 1 ? 'text-[24px]' : fontLevel === 2 ? 'text-[26px]' : 'text-[28px]'
            }`}>
              8.5
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
