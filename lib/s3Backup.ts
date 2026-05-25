import 'server-only';

import { createHash, createHmac } from 'node:crypto';
import type { S3BackupConfig } from '@/lib/backupConfig';

function sha256Hex(value: Buffer | string) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Buffer | string, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function amzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function dateStamp(date: Date) {
  return amzDate(date).slice(0, 8);
}

function canonicalPath(pathname: string) {
  return pathname
    .split('/')
    .map(segment => encodeURIComponent(segment).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`))
    .join('/');
}

function signingKey(secretAccessKey: string, date: string, region: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, date);
  const dateRegionKey = hmac(dateKey, region);
  const dateRegionServiceKey = hmac(dateRegionKey, 's3');
  return hmac(dateRegionServiceKey, 'aws4_request');
}

function objectUrl(config: S3BackupConfig, key: string) {
  const endpoint = new URL(config.endpoint);
  const basePath = endpoint.pathname.replace(/\/$/, '');
  const cleanKey = key.replace(/^\/+/, '');
  const pathname = config.forcePathStyle
    ? `${basePath}/${config.bucket}/${cleanKey}`
    : `${basePath}/${cleanKey}`;
  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  return new URL(`${endpoint.protocol}//${host}${pathname}`);
}

export async function uploadS3Object(config: S3BackupConfig, key: string, body: Buffer, contentType: string) {
  const url = objectUrl(config, key);
  const now = new Date();
  const requestDate = amzDate(now);
  const requestDateStamp = dateStamp(now);
  const payloadHash = sha256Hex(body);
  const headers: Record<string, string> = {
    'content-type': contentType,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': requestDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(name => `${name}:${headers[name].trim()}\n`)
    .join('');
  const canonicalRequest = [
    'PUT',
    canonicalPath(url.pathname),
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${requestDateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    requestDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const signature = hmacHex(signingKey(config.secretAccessKey, requestDateStamp, config.region), stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, authorization },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`S3 upload failed: HTTP ${response.status}${message ? ` ${message.slice(0, 300)}` : ''}`);
  }

  return url.toString();
}
