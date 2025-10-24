import { useEffect, useRef, useState } from 'react'
import './index.css'
import { FaMicrophoneAlt,FaSearchengin } from 'react-icons/fa'
import { TbWorldSearch } from "react-icons/tb";

export default function App() {
  const [status, setStatus] = useState('Tap on mic to speak then hit GO !')
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const textInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  function setupRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setStatus('SpeechRecognition not supported; use the text box below.')
      return null
    }
    const r = new SR()
    r.lang = 'en-US'
    r.interimResults = true
    r.continuous = true

    r.onstart = () => setStatus('Listening…')
    r.onend = () => {
      setStatus('Tap again on mic to speak...')
      setListening(false)
    }
    r.onerror = (e) => setStatus(`Error: ${e.error}`)
    r.onresult = (event) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const res = event.results[i]
        const txt = res[0].transcript
        if (res.isFinal) finalTranscriptRef.current += txt + ' '
        else interim += txt
      }
      setTranscript((finalTranscriptRef.current + interim).trim())
    }
    return r
  }

  async function generateReply(prompt) {
    setResponse('Thinking…')
    setLoading(true)
    try {
      const res = await fetch('http://localhost:3000/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      })
      const data = await res.json()
      if (data.error) {
        setResponse(`Error: ${data.error}`)
        return
      }
      const text = (data.text || '').trim()
      setResponse(text)

      if ('speechSynthesis' in window && text) {
        const utter = new SpeechSynthesisUtterance(text)
        utter.rate = 1
        utter.pitch = 1
        utter.onstart = () => setSpeaking(true)
        utter.onend = () => setSpeaking(false)
        utter.onerror = () => setSpeaking(false)
        window.speechSynthesis.cancel()
        window.speechSynthesis.speak(utter)
      }
    } catch (e) {
      setResponse(`Request failed: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 flex flex-col justify-center items-center">
      <div className="container-max mx-auto p-6 w-[100%]">
        <h1 className="text-3xl font-bold mb-4">AI Voice Assistant</h1>

        {loading && (
          <div className="inline-flex items-center gap-2 text-slate-400">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25" />
              <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            <span>Thinking…</span>
          </div>
        )}

        {/* text box */}
        <div className="grid gap-4">
          <div className="bg-slate-800 rounded-xl p-4 min-h-[450px] max-h-[450px] overflow-auto">
            <span className="text-slate-400">Result:</span>
            <div className="whitespace-pre-wrap leading-relaxed mt-2">
              {response || '...will be displayed here'}
            </div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4">
            <span className="text-sm text-slate-400">{status}</span>
            <div className="mt-2 whitespace-pre-wrap leading-relaxed">
              {transcript || ''}
            </div>
          </div>
        </div>

        {/* controls */}
        <div className="flex items-center gap-3 mt-4 mb-4">
          <button
            onClick={() => {
              if (!recognitionRef.current) recognitionRef.current = setupRecognition()
              if (!recognitionRef.current) return
              finalTranscriptRef.current = ''
              setListening(true)
              recognitionRef.current.start()
            }}
            disabled={listening || loading}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 font-semibold transition-colors
              ${listening || loading ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}
            `}
            aria-busy={loading}
          >
            <span className="text-[24px]"><FaMicrophoneAlt /></span>
          </button>
          <button
            onClick={() => {
              if (speaking) {
                window.speechSynthesis.cancel()
                setSpeaking(false)
                return
              }
              if (recognitionRef.current && listening) {
                recognitionRef.current.stop()
                const prompt = transcript.trim()
                if (prompt) generateReply(prompt)
              }
            }}
            disabled={(!listening && !speaking) || loading}
            className={`rounded-lg px-4 py-2 font-semibold transition-colors
              ${(!listening && !speaking) || loading ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}
            `}
          >
            {speaking ? 'Stop' : 'GO'}
          </button>
          <div className="flex items-start gap-3 flex-1">
            <textarea
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 px-3 py-2 min-h-[42px]"
              ref={textInputRef}
              rows={1}
              placeholder="Type to search..."
              disabled={loading}
            />
            <button
              onClick={() => {
                const prompt = textInputRef.current?.value?.trim()
                if (!prompt) return
                setTranscript(prompt)
                textInputRef.current.value = ''
                generateReply(prompt)
              }}
              disabled={loading}
              className={`rounded-lg px-4 py-2 font-semibold transition-colors
                ${loading ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500'}
              `}
            >
              {loading ? <TbWorldSearch className="text-[24px]" /> : <FaSearchengin className="text-[24px]" />}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}