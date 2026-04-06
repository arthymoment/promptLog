'use strict';

const pad = n => String(n).padStart(2, '0');

// 將 Date 物件轉換為 UTC+8 偏移後的 Date（用 UTC 方法讀取即為 UTC+8 時間）
const toUTC8 = (d = new Date()) => new Date(d.getTime() + 8 * 60 * 60 * 1000);

// 將 UTC 時間字串（YYYY-MM-DD HH:mm:ss 格式）轉換為 UTC+8 時間字串
const convertToUTC8 = (utcTimeStr) => {
  if (!utcTimeStr) return null;
  // 假設輸入是 UTC 時間字串，解析並加上 8 小時
  const [date, time] = utcTimeStr.split(' ');
  const [year, month, day] = date.split('-');
  const [hour, minute, second] = time.split(':');
  
  const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  const utc8Date = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
  
  return `${utc8Date.getUTCFullYear()}-${pad(utc8Date.getUTCMonth() + 1)}-${pad(utc8Date.getUTCDate())} ${pad(utc8Date.getUTCHours())}:${pad(utc8Date.getUTCMinutes())}:${pad(utc8Date.getUTCSeconds())}`;
};

// 格式化為 UTC+8 的 ISO 時間字串：YYYY-MM-DDTHH:mm:ss+08:00
const formatUTC8ISO = (d = new Date()) => {
  const u = toUTC8(d);
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())}T${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}:${pad(u.getUTCSeconds())}+08:00`;
};

// 格式化為 UTC+8 的顯示字串：YYYY-MM-DD HH:mm:ss
const formatUTC8Display = (d = new Date()) => {
  const u = toUTC8(d);
  return `${u.getUTCFullYear()}-${pad(u.getUTCMonth() + 1)}-${pad(u.getUTCDate())} ${pad(u.getUTCHours())}:${pad(u.getUTCMinutes())}:${pad(u.getUTCSeconds())}`;
};

// 產生 UTC+8 的時間戳記字串：YYYY_MMDD_HHmm_ss（用於 log 檔名）
const formatUTC8Ts = (d = new Date()) => {
  const u = toUTC8(d);
  return `${u.getUTCFullYear()}_${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}_${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}_${pad(u.getUTCSeconds())}`;
};

module.exports = { toUTC8, convertToUTC8, formatUTC8ISO, formatUTC8Display, formatUTC8Ts };
