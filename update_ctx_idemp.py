import os
import uuid

path = r'C:\Projects\SafeVoice\mobile\src\context\SafeVoiceContext.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add ref
if 'idempotencyKeyRef = useRef' not in content:
    content = content.replace("const lastLogTimeRef = useRef<number>(0);", "const lastLogTimeRef = useRef<number>(0);\n  const idempotencyKeyRef = useRef<string | null>(null);")

# 2. Generate on countdown start
old_start = '''    if (score >= 70 && decision === 'Normal' && countdown === null) {
      setDecision('Potential Emergency');
      setCountdown(10);
      console.log(`[DECISION_DEBUG] Decision changed to Potential Emergency! Starting countdown.`);
    }'''

new_start = '''    if (score >= 70 && decision === 'Normal' && countdown === null) {
      setDecision('Potential Emergency');
      setCountdown(10);
      idempotencyKeyRef.current = new Date().getTime().toString() + '-' + Math.random().toString(36).substring(7);
      console.log(`[DECISION_DEBUG] Decision changed to Potential Emergency! Starting countdown.`);
    }'''

if old_start in content:
    content = content.replace(old_start, new_start)

# 3. Clear on reset
old_cancel = '''  const cancelEmergency = () => {
    setCountdown(null);
    setDecision('Normal');
    setLocation(null);
    setKeywordCount(0);
    setRepetitionFactor(0);
    setEmergencyScore(0);
    lastKeywordTimeRef.current = 0;
  };'''

new_cancel = '''  const cancelEmergency = () => {
    setCountdown(null);
    setDecision('Normal');
    setLocation(null);
    setKeywordCount(0);
    setRepetitionFactor(0);
    setEmergencyScore(0);
    lastKeywordTimeRef.current = 0;
    idempotencyKeyRef.current = null;
  };'''

if old_cancel in content:
    content = content.replace(old_cancel, new_cancel)

old_reset = '''      timer = setTimeout(() => {
        setCountdown(null);
        setDecision('Normal');
        setLocation(null);
        setKeywordCount(0);
        setRepetitionFactor(0);
        setEmergencyScore(0);
        lastKeywordTimeRef.current = 0;
        console.log(`[DECISION_DEBUG] Returning to Normal monitoring state.`);
      }, 3000);'''

new_reset = '''      timer = setTimeout(() => {
        setCountdown(null);
        setDecision('Normal');
        setLocation(null);
        setKeywordCount(0);
        setRepetitionFactor(0);
        setEmergencyScore(0);
        lastKeywordTimeRef.current = 0;
        idempotencyKeyRef.current = null;
        console.log(`[DECISION_DEBUG] Returning to Normal monitoring state.`);
      }, 3000);'''

if old_reset in content:
    content = content.replace(old_reset, new_reset)

# 4. Use the ref in payload
old_payload = '''          const idempotencyKey = new Date().getTime().toString() + '-' + Math.random().toString(36).substring(7);
          const payload = {
            trigger_type: 'keyword',
            score: Math.round(emergencyScore),
            location_lat: currentLoc !== 'error' && currentLoc ? currentLoc.latitude : null,
            location_lng: currentLoc !== 'error' && currentLoc ? currentLoc.longitude : null,
            idempotency_key: idempotencyKey
          };'''

new_payload = '''          const payload = {
            trigger_type: 'keyword',
            score: Math.round(emergencyScore),
            location_lat: currentLoc !== 'error' && currentLoc ? currentLoc.latitude : null,
            location_lng: currentLoc !== 'error' && currentLoc ? currentLoc.longitude : null,
            idempotency_key: idempotencyKeyRef.current
          };'''

if old_payload in content:
    content = content.replace(old_payload, new_payload)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated SafeVoiceContext idempotency logic")
