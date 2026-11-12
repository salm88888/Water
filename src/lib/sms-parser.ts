/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Sabafon SMS Protocol Engine & Parser
 * Handles SMS formatting, incoming gateway parsing, sequence verification, and duplicate rejection.
 */

import { GPSEventType, SMSMessage } from '../types';

export interface ParsedWaterSMS {
  isValid: boolean;
  header: string;
  tripNumber: string;
  eventType: GPSEventType;
  lat: number;
  lng: number;
  speed?: number;
  timeString: string;
  sequenceNumber: number;
  customerId?: string;
  rawText: string;
  errorMessage?: string;
}

/**
 * Parses raw SMS text received on the Sabafon modem / GSM gateway
 */
export function parseSabafonSMS(rawText: string): ParsedWaterSMS {
  const clean = rawText.trim();
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  if (!clean.includes('WATER TRACK') && !lines[0]?.toUpperCase().includes('WATER TRACK')) {
    return {
      isValid: false,
      header: '',
      tripNumber: '',
      eventType: 'MOVING',
      lat: 0,
      lng: 0,
      timeString: '',
      sequenceNumber: 0,
      rawText,
      errorMessage: 'الرسالة لا تبدأ بالترويسة المعتمدة WATER TRACK',
    };
  }

  const data: Record<string, string> = {};
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const key = line.substring(0, colonIndex).trim().toUpperCase();
      const val = line.substring(colonIndex + 1).trim();
      data[key] = val;
    }
  }

  const rawTrip = data['TRIP'] || '';
  const tripNumber = rawTrip.startsWith('TRIP-') ? rawTrip : `TRIP-${rawTrip}`;
  const rawEvent = (data['EVENT'] || '').toUpperCase();
  const rawLat = parseFloat(data['LAT'] || '0');
  const rawLon = parseFloat(data['LON'] || data['LNG'] || '0');
  const rawSpeed = data['SPEED'] ? parseFloat(data['SPEED']) : undefined;
  const timeString = data['TIME'] || new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' });
  const seq = parseInt(data['SEQ'] || '0', 10);
  const customerId = data['CUSTOMER'] || undefined;

  let eventType: GPSEventType = 'MOVING';
  if (rawEvent.includes('MOVING')) eventType = 'MOVING';
  else if (rawEvent.includes('STOPPED') || rawEvent.includes('STOP')) eventType = 'STOPPED';
  else if (rawEvent.includes('ARRIVAL') || rawEvent.includes('ARRIVE')) eventType = 'ARRIVAL';
  else if (rawEvent.includes('DEPARTURE') || rawEvent.includes('DEPART')) eventType = 'DEPARTURE';
  else if (rawEvent.includes('HEARTBEAT')) eventType = 'HEARTBEAT_10M';
  else if (rawEvent.includes('START')) eventType = 'START';
  else if (rawEvent.includes('RETURN') || rawEvent.includes('PLANT')) eventType = 'RETURN_PLANT';
  else if (rawEvent.includes('END')) eventType = 'END';

  if (!tripNumber || isNaN(rawLat) || isNaN(rawLon) || rawLat === 0 || rawLon === 0) {
    return {
      isValid: false,
      header: 'WATER TRACK',
      tripNumber,
      eventType,
      lat: rawLat,
      lng: rawLon,
      timeString,
      sequenceNumber: seq,
      rawText,
      errorMessage: 'إحداثيات GPS غير صالحة أو رقم الرحلة مفقود في نص الرسالة',
    };
  }

  return {
    isValid: true,
    header: 'WATER TRACK',
    tripNumber,
    eventType,
    lat: rawLat,
    lng: rawLon,
    speed: rawSpeed,
    timeString,
    sequenceNumber: seq,
    customerId,
    rawText,
  };
}

/**
 * Builds outbound Sabafon SMS string in the standard format
 */
export function buildWaterSMS(params: {
  tripNumber: string;
  eventType: GPSEventType;
  lat: number;
  lng: number;
  speed?: number;
  sequenceNumber: number;
  customerId?: string;
  timeString?: string;
}): string {
  const now = new Date();
  const timeStr = params.timeString || `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const seqStr = String(params.sequenceNumber).padStart(4, '0');
  
  // Format trip number without TRIP- if present to keep short SMS payload
  const cleanTrip = params.tripNumber.replace(/^TRIP-/, '');

  let sms = `WATER TRACK\nTRIP: ${cleanTrip}\nEVENT: ${params.eventType}`;
  if (params.customerId) {
    sms += `\nCUSTOMER: ${params.customerId}`;
  }
  sms += `\nLAT: ${params.lat.toFixed(4)}\nLON: ${params.lng.toFixed(4)}`;
  if (params.speed !== undefined && params.speed > 0) {
    sms += `\nSPEED: ${Math.round(params.speed)}`;
  }
  sms += `\nTIME: ${timeStr}\nSEQ: ${seqStr}`;

  return sms;
}

/**
 * Verifies if an incoming message is duplicate by checking against existing SMS logs
 */
export function isDuplicateMessage(
  existingLogs: SMSMessage[],
  tripNumber: string,
  sequenceNumber: number,
  eventType: GPSEventType
): boolean {
  return existingLogs.some(
    (msg) =>
      msg.tripNumber === tripNumber &&
      msg.sequenceNumber === sequenceNumber &&
      msg.eventType === eventType
  );
}
