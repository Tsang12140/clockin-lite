'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, X } from 'lucide-react';
import { saveFactoryInfo } from './actions';

const LOGO_MAX_SIDE = 256;
const LOGO_QUALITY = 0.85;
const ACCEPT_MIME = ['image/png', 'image/jpeg'];

type Props = {
  initialFactoryShortName: string;
  initialLogoBase64: string;
};

export default function FactoryForm({ initialFactoryShortName, initialLogoBase64 }: Props) {
  const [shortName, setShortName] = useState(initialFactoryShortName);
  const [logoBase64, setLogoBase64] = useState<string>(initialLogoBase64);
  const [logoChanged, setLogoChanged] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleFile = async (file: File) => {
    setError('');
    setInfo('');
    if (!ACCEPT_MIME.includes(file.type)) {
      setError('只支持 PNG / JPG 格式');
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const compressed = await compressImage(dataUrl, LOGO_MAX_SIDE, LOGO_QUALITY);
      setLogoBase64(compressed);
      setLogoChanged(true);
      setInfo(`已选择，压缩后约 ${Math.round(compressed.length / 1024)} KB`);
    } catch (e) {
      console.error('logo compress error', e);
      setError('图片处理失败：' + String(e));
    }
  };

  const handleRemove = () => {
    setLogoBase64('');
    setLogoChanged(true);
    setInfo('Logo 已移除');
  };

  const handleSave = () => {
    setError('');
    setInfo('');
    if (shortName.trim().length < 1 || shortName.trim().length > 10) {
      setError('工厂简称需为 1-10 字');
      return;
    }
    startTransition(async () => {
      try {
        const result = await saveFactoryInfo({
          factoryShortName: shortName.trim(),
          logoBase64: logoChanged ? (logoBase64 || null) : '',
        });
        if (result.ok) {
          setInfo('保存成功');
          setLogoChanged(false);
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch (e) {
        console.error('save factory error', e);
        setError('保存失败：' + String(e));
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <label className="mb-1.5 block text-[13px] text-gray-500">工厂简称</label>
        <input
          value={shortName}
          onChange={e => setShortName(e.target.value.slice(0, 10))}
          maxLength={10}
          placeholder="2-4 字最佳，最长 10 字"
          className="h-11 w-full rounded-xl border border-gray-200 px-3 text-[15px] focus:border-[#3370FF] focus:outline-none focus:ring-2 focus:ring-[#3370FF]/40"
        />
        <p className="mt-2 text-[12px] text-gray-400">显示在顶部 LOGO 区、页面标题、备份文件名</p>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-[13px] text-gray-500">工厂 Logo（可选）</label>
          {logoBase64 && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-red-500"
            >
              <X size={14} />移除
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F0F4FA] shadow-inner">
            {logoBase64 ? (
              <img src={logoBase64} alt="logo" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={22} className="text-gray-300" />
            )}
          </div>
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-[#F0F4FA] py-3 text-[13px] font-medium text-[#3370FF] hover:bg-[#E5EDFB]">
            选择图片
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <p className="mt-2 text-[12px] text-gray-400">PNG / JPG，自动压缩为 256×256</p>
      </div>

      {(error || info) && (
        <div className="rounded-2xl bg-white p-3 shadow-sm">
          {error && <p className="text-[13px] text-red-500">{error}</p>}
          {info && !error && <p className="text-[13px] text-[#3370FF]">{info}</p>}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={isPending}
        className="h-12 w-full rounded-2xl bg-[#3370FF] text-[15px] font-semibold text-white shadow-sm disabled:opacity-60"
      >
        {isPending ? '保存中…' : '保存'}
      </button>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('无法初始化 Canvas'));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png', quality));
    };
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = dataUrl;
  });
}
