import SwiftUI
import Speech
import AVFoundation
import Combine

@MainActor
final class ThinkSpeechService: ObservableObject {
    @Published var transcript = ""
    @Published var level: CGFloat = 0
    @Published var listening = false
    @Published var message: String?

    private let engine = AVAudioEngine()
    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ru_RU"))
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?

    func start() async {
        guard !listening else { return }
        message = nil
        let auth = await withCheckedContinuation { (continuation: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { result in
                continuation.resume(returning: result)
            }
        }
        guard auth == .authorized else {
            message = "Разреши распознавание речи в Настройках iPhone."
            return
        }
        let microphone = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVAudioSession.sharedInstance().requestRecordPermission { allowed in
                continuation.resume(returning: allowed)
            }
        }
        guard microphone else {
            message = "Разреши доступ к микрофону в Настройках iPhone."
            return
        }
        guard let recognizer, recognizer.isAvailable else {
            message = "Распознавание речи сейчас недоступно. Можно записать идею текстом."
            return
        }
        recognitionTask?.cancel()
        recognitionTask = nil
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.record, mode: .measurement, options: [])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            self.request = request
            let node = engine.inputNode
            let format = node.outputFormat(forBus: 0)
            guard format.sampleRate > 0 else {
                message = "Не удалось получить звук с микрофона."
                return
            }
            node.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                request.append(buffer)
                if let samples = buffer.floatChannelData?[0] {
                    let count = Int(buffer.frameLength)
                    if count > 0 {
                        var energy: Float = 0
                        let step = max(1, count / 96)
                        var used = 0
                        for i in stride(from: 0, to: count, by: step) {
                            energy += samples[i] * samples[i]
                            used += 1
                        }
                        let rms = sqrt(energy / Float(max(1, used)))
                        let amplitude = CGFloat(min(1, rms * 17))
                        Task { @MainActor [weak self] in
                            self?.level = amplitude
                        }
                    }
                }
            }
            engine.prepare()
            try engine.start()
            listening = true
            recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                    }
                    if let error, self.listening {
                        self.message = error.localizedDescription
                        self.stop()
                    }
                }
            }
        } catch {
            if engine.isRunning { engine.stop() }
            engine.inputNode.removeTap(onBus: 0)
            try? session.setActive(false, options: .notifyOthersOnDeactivation)
            message = "Не удалось запустить микрофон: \(error.localizedDescription)"
        }
    }

    func stop() {
        guard listening else { return }
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        recognitionTask?.finish()
        request = nil
        listening = false
        level = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

struct ThinkWaveform: View {
    var level: CGFloat
    var active: Bool
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0/30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 3.5) {
                ForEach(0..<37, id: \.self) { i in
                    let shape = abs(sin(Double(i) * 0.71) * cos(Double(i) * 0.17 + t * (active ? 5.0 : 0.4)))
                    let base = 4.0 + 23.0 * shape * Double(active ? max(level, 0.18) : 0.12)
                    Capsule()
                        .fill(i > 14 && i < 25 ? Theme.purple : Theme.muted.opacity(0.54))
                        .frame(width: 2.3, height: CGFloat(base))
                }
            }
        }.frame(height: 41).accessibilityHidden(true)
    }
}

struct ThinkMicrophone: View {
    var level: CGFloat
    var listening: Bool

    var body: some View {
        TimelineView(.animation(minimumInterval: 1/30)) { context in
            let t = context.date.timeIntervalSinceReferenceDate
            let pulse = CGFloat(1.0 + sin(t * 2.6) * 0.045 + Double(level) * 0.13)
            ZStack {
                Circle()
                    .fill(RadialGradient(colors: [
                        Theme.purple.opacity(listening ? 0.16 : 0.08),
                        Theme.purple.opacity(listening ? 0.055 : 0.025),
                        .clear
                    ], center: .center, startRadius: 20, endRadius: 85))
                    .frame(width: 200, height: 200)
                Circle().stroke(Theme.purple.opacity(0.08), lineWidth: 0.7)
                    .frame(width: 116, height: 116).scaleEffect(pulse)
                Circle().stroke(Theme.purple.opacity(0.14), lineWidth: 1)
                    .frame(width: 100, height: 100).scaleEffect(pulse * 0.99)
                Circle()
                    .fill(RadialGradient(colors: [.white, Color(red: 0.96, green: 0.88, blue: 1), Theme.purpleLight], center: .init(x: 0.33, y: 0.22), startRadius: 3, endRadius: 58))
                    .frame(width: 77, height: 77)
                    .shadow(color: Theme.purple.opacity(0.21), radius: 18)
                Image(systemName: listening ? "mic.fill" : "mic.slash")
                    .font(.system(size: 24, weight: .light))
                    .foregroundStyle(Theme.purple)
            }.scaleEffect(pulse)
        }.frame(width: 205, height: 205)
        .accessibilityLabel(listening ? "Микрофон включён" : "Микрофон выключен")
    }
}

struct ThinkOrb: View {
    var active = true
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0/30)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let breathe = CGFloat(1 + sin(t * 1.55) * 0.035)
            ZStack {
                Circle()
                    .fill(Theme.purple.opacity(0.12))
                    .frame(width: 230, height: 230)
                    .blur(radius: 52)
                Circle()
                    .fill(
                        RadialGradient(colors: [
                            Color(red: 0.99, green: 0.95, blue: 1),
                            Color(red: 0.90, green: 0.70, blue: 1),
                            Color(red: 0.54, green: 0.16, blue: 0.80),
                            Color(red: 0.24, green: 0.10, blue: 0.48)
                        ], center: .init(x: 0.29, y: 0.22), startRadius: 8, endRadius: 122)
                    )
                    .frame(width: 169, height: 169)
                    .shadow(color: Theme.purple.opacity(0.19), radius: 29, y: 16)
                Ellipse()
                    .fill(LinearGradient(colors: [
                        Color(red: 1, green: 0.92, blue: 1),
                        Color(red: 0.96, green: 0.70, blue: 1).opacity(0.85),
                        Color(red: 0.65, green: 0.30, blue: 0.89).opacity(0.2)
                    ], startPoint: .top, endPoint: .bottom))
                    .frame(width: 172, height: 73)
                    .rotationEffect(.degrees(-18 + sin(t * 0.8) * 9))
                    .offset(x: 0, y: 28 + sin(t * 1.1) * 7)
                    .mask(Circle().frame(width: 169, height: 169))
                    .blur(radius: 5)
                Circle().stroke(.white.opacity(0.50), lineWidth: 0.8)
                    .frame(width: 169, height: 169)
            }
            .scaleEffect(active ? breathe : 1)
        }
        .frame(width: 260, height: 260)
        .accessibilityLabel("Живой пурпурный шар")
    }
}

struct ReactiveEdgeGlow: View {
    let level: CGFloat
    let listening: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0/30.0)) { timeline in
            let time = timeline.date.timeIntervalSinceReferenceDate
            let glow = listening ? (0.25 + Double(level) * 0.35 + 0.08 * sin(time * 2.4)) : 0.035
            let spin = reduceMotion ? 0.0 : time * 13
            RoundedRectangle(cornerRadius: 41, style: .continuous)
                .stroke(
                    AngularGradient(colors: [
                        Theme.purple.opacity(0.32),
                        Color(red: 0.76, green: 0.58, blue: 1),
                        .white.opacity(0.5),
                        Theme.purple.opacity(0.52),
                        Color(red: 0.86, green: 0.77, blue: 1),
                        Theme.purple.opacity(0.32)
                    ], center: .center, angle: .degrees(spin)),
                    lineWidth: 15
                )
                .blur(radius: 27)
                .opacity(max(0, glow))
                .padding(1)
                .overlay {
                    RoundedRectangle(cornerRadius: 41, style: .continuous)
                        .stroke(Theme.purple.opacity(listening ? 0.14 : 0.03), lineWidth: 2.4)
                        .blur(radius: 7)
                        .padding(1)
                }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

struct PremiumVoiceScreen: View {
    @EnvironmentObject private var store: IdeaStore
    @StateObject private var speech = ThinkSpeechService()
    let initialText: String
    let onSwitchToText: (String) -> Void
    let onFinished: () -> Void
    let onCancel: () -> Void
    @State private var committed = false

    private var fullText: String {
        let typed = initialText.trimmingCharacters(in: .whitespacesAndNewlines)
        let spoken = speech.transcript.trimmingCharacters(in: .whitespacesAndNewlines)
        return [typed, spoken].filter { !$0.isEmpty }.joined(separator: "\n")
    }

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            RadialGradient(
                colors: [Theme.purpleLight.opacity(0.17), .clear],
                center: .bottom, startRadius: 5, endRadius: 440
            ).ignoresSafeArea().allowsHitTesting(false)
            ReactiveEdgeGlow(level: speech.level, listening: speech.listening)
            VStack(spacing: 0) {
                HStack {
                    Button { speech.stop(); onCancel() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 17))
                            .frame(width: 42, height: 42)
                    }
                    Spacer()
                    Text("ГОЛОСОВАЯ ИДЕЯ")
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(2.1)
                        .foregroundStyle(Theme.muted)
                    Spacer()
                    Color.clear.frame(width: 42, height: 42)
                }
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 19)
                .padding(.top, 12)

                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text(fullText.isEmpty
                             ? "Расскажи идею.\nЯ сохраню\nкаждую мысль."
                             : fullText)
                            .font(.system(size: 31, weight: .regular))
                            .tracking(-0.8)
                            .lineSpacing(3)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .foregroundStyle(
                                LinearGradient(colors: [
                                    Theme.ink, Theme.ink.opacity(0.96),
                                    Theme.muted.opacity(0.52)
                                ], startPoint: .top, endPoint: .bottom)
                            )
                            .contentTransition(.opacity)
                            .animation(.easeOut(duration: 0.24), value: fullText)
                            .padding(.top, 58)
                        if let message = speech.message {
                            Text(message)
                                .font(.system(size: 14))
                                .foregroundStyle(Theme.purple)
                                .padding(.top, 8)
                        }
                    }
                    .padding(.horizontal, 29)
                }.scrollIndicators(.hidden)

                Text(speech.listening ? "СЛУШАЮ..." : "ЗАПИСЬ НА ПАУЗЕ")
                    .tracking(2.5)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Theme.muted)
                Button {
                    if speech.listening {
                        speech.stop()
                    } else {
                        Task { await speech.start() }
                    }
                } label: {
                    ThinkMicrophone(level: speech.level, listening: speech.listening)
                }.buttonStyle(.plain).frame(height: 173)

                if !fullText.isEmpty {
                    Button {
                        guard !committed else { return }
                        committed = true
                        speech.stop()
                        store.save(fullText, existing: nil)
                        onFinished()
                    } label: {
                        Text("Сохранить мысль")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 11))
                    }
                    .disabled(committed)
                    .padding(.horizontal, 29)
                }

                Button {
                    speech.stop()
                    onSwitchToText(fullText)
                } label: {
                    Label("Перейти к тексту", systemImage: "keyboard")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                        .padding(.vertical, 16)
                }
                .padding(.bottom, 8)
            }
        }
        .onAppear { Task { await speech.start() } }
        .onDisappear { speech.stop() }
    }
}
