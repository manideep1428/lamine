"use client"

/**
 * Voice. Free, optional, and off by default.
 *
 * `speechSynthesis` is everywhere. `SpeechRecognition` is Chrome and Edge only,
 * so the microphone button is *hidden* where it does not exist rather than
 * offered and then failing — typing stays the primary way in.
 */

import { useCallback, useEffect, useRef, useState } from "react"

import { useStoredValue } from "@/hooks/use-local"
import { BUDDY_PITCH, isBuddy } from "@/lib/core/crew"

const VOICE_KEY = "lamine:voice"

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>
      }) => void)
    | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => RecognitionLike

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function listeningSupported(): boolean {
  return recognitionCtor() !== null
}

/* ════════════════════════════════════════════════════════════════════════
   Speaking
   ════════════════════════════════════════════════════════════════════════ */

/** Strip the things that read badly out loud: emoji, code, file paths. */
export function speakable(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/`[^`]*`/g, "that bit of code")
    .replace(/\s+/g, " ")
    .trim()
}

export function speak(text: string, who = "codey"): void {
  if (!speechSupported()) return
  const body = speakable(text)
  if (!body) return

  const utterance = new SpeechSynthesisUtterance(body.slice(0, 300))
  utterance.pitch = isBuddy(who) ? BUDDY_PITCH[who] : 1
  utterance.rate = 1.02
  utterance.volume = 0.9
  window.speechSynthesis.speak(utterance)
}

export function stopSpeaking(): void {
  if (speechSupported()) window.speechSynthesis.cancel()
}

/**
 * The header toggle, remembered across visits.
 *
 * The preference is read through the localStorage external store rather than
 * copied into state in an effect, so there is no render cascade and no moment
 * where the button shows the wrong thing.
 */
export function useVoice() {
  const [enabled, setEnabled] = useStoredValue(VOICE_KEY, false, parseFlag)

  const toggle = useCallback(() => {
    const next = !enabled
    setEnabled(next)
    if (!next) stopSpeaking()
  }, [enabled, setEnabled])

  const say = useCallback(
    (text: string, who?: string) => {
      if (enabled) speak(text, who)
    },
    [enabled]
  )

  return { enabled, toggle, say, supported: speechSupported() }
}

function parseFlag(raw: string): boolean | null {
  if (raw === "on" || raw === "true") return true
  if (raw === "off" || raw === "false") return false
  return null
}

/* ════════════════════════════════════════════════════════════════════════
   Listening
   ════════════════════════════════════════════════════════════════════════ */

export function useListening(onHeard: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const recognition = useRef<RecognitionLike | null>(null)
  const onHeardRef = useRef(onHeard)
  useEffect(() => {
    onHeardRef.current = onHeard
  })

  const stop = useCallback(() => {
    recognition.current?.stop()
    recognition.current = null
    setListening(false)
  }, [])

  const start = useCallback(() => {
    const Ctor = recognitionCtor()
    if (!Ctor) return

    const instance = new Ctor()
    instance.lang = "en-US"
    instance.interimResults = false
    instance.continuous = false
    instance.onresult = (event) => {
      const said = event.results?.[0]?.[0]?.transcript ?? ""
      if (said) onHeardRef.current(said)
    }
    instance.onerror = () => setListening(false)
    instance.onend = () => setListening(false)

    recognition.current = instance
    setListening(true)
    instance.start()
  }, [])

  useEffect(() => () => recognition.current?.stop(), [])

  return { listening, start, stop, supported: listeningSupported() }
}
