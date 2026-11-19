import SwiftUI

struct ThinkActionStyle: ButtonStyle {
    var filled: Bool = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(filled ? Theme.panel : Theme.paper)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .stroke(Theme.line, lineWidth: filled ? 0 : 1)
            )
            .opacity(configuration.isPressed ? 0.65 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.16), value: configuration.isPressed)
    }
}

struct SoftPurpleAtmosphere: View {
    var bottom = true
    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Theme.paper
                RadialGradient(
                    colors: [
                        Theme.purpleLight.opacity(0.27),
                        Theme.purpleLight.opacity(0.1),
                        .clear
                    ],
                    center: bottom ? .bottom : .top,
                    startRadius: 0,
                    endRadius: max(400, geometry.size.height * 0.73)
                )
            }
        }.ignoresSafeArea().allowsHitTesting(false)
    }
}

enum ThinkEntry: String, Identifiable {
    case voice, text
    var id: String { rawValue }
}

struct PremiumRootScreen: View {
    @EnvironmentObject private var store: IdeaStore
    @State private var activeTab = 0
    @State private var entry: ThinkEntry?
    @State private var chosenIdea: Idea?

    var body: some View {
        ZStack {
            SoftPurpleAtmosphere(bottom: true)
            VStack(spacing: 0) {
                if activeTab == 0 {
                    PremiumHomeScreen(
                        voice: { entry = .voice },
                        text: { entry = .text }
                    )
                } else if activeTab == 1 {
                    PremiumIdeasScreen(
                        onCreate: { entry = .text },
                        onSelect: { chosenIdea = $0 }
                    )
                } else {
                    PremiumStarsScreen()
                }
                HStack {
                    tab("house", "Главная", 0)
                    Spacer()
                    tab("square.stack", "Идеи", 1)
                    Spacer()
                    tab("sparkle", "Звёзды", 2)
                }
                .padding(.horizontal, 50)
                .padding(.top, 10)
                .padding(.bottom, 11)
                .background(Theme.paper.opacity(0.86))
                .overlay(alignment: .top) {
                    Theme.line.frame(height: 0.5).opacity(0.65)
                }
            }
        }
        .sheet(item: $entry) { choice in
            Group {
                if choice == .voice {
                    PremiumVoiceScreen()
                } else {
                    PremiumTextEditor(initialText: "", existing: nil)
                }
            }
            .environmentObject(store)
        }
        .sheet(item: $chosenIdea) { idea in
            PremiumIdeaDetail(idea: idea)
                .environmentObject(store)
        }
    }

    private func tab(_ symbol: String, _ caption: String, _ index: Int) -> some View {
        Button {
            withAnimation(.easeInOut(duration: 0.18)) { activeTab = index }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.system(size: 19, weight: .regular))
                Text(caption)
                    .font(.system(size: 10, weight: .medium))
            }
            .frame(width: 56, height: 43)
            .foregroundStyle(activeTab == index ? Theme.purple : Theme.muted)
        }.buttonStyle(.plain)
    }
}

struct PremiumHomeScreen: View {
    @EnvironmentObject private var store: IdeaStore
    let voice: () -> Void
    let text: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("ВАШЕ ПРОСТРАНСТВО МЫСЛЕЙ")
                    .font(.system(size: 10, weight: .medium))
                    .tracking(1.65).foregroundStyle(Theme.muted)
                Spacer()
                HStack(spacing: 5) {
                    ThinkStar().fill(Theme.purple).frame(width: 14, height: 14)
                    Text("\(store.stars)")
                        .font(.system(size: 13, weight: .medium))
                }.foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, 28).padding(.top, 23)

            Spacer(minLength: 30)
            VStack(spacing: 16) {
                ThinkLogo(compact: false)
                    .scaleEffect(1.58)
                    .padding(.bottom, 20)
                Text("Поймай мысль,\nпока она не исчезла.")
                    .font(.system(size: 30, weight: .regular))
                    .tracking(-0.7)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.ink)
                    .padding(.top, 22)
                Text("Говори, пиши, сохраняй и возвращайся\nк своим идеям в любой момент.")
                    .font(.system(size: 14))
                    .lineSpacing(4)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.muted)
            }
            Spacer()
            VStack(spacing: 10) {
                Button(action: voice) {
                    Label("Записать голосом", systemImage: "mic")
                }
                .buttonStyle(ThinkActionStyle(filled: true))
                Button(action: text) {
                    Label("Написать идею", systemImage: "pencil")
                }
                .buttonStyle(ThinkActionStyle())
                Text("Идея становится реальной, когда ты её записал.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.muted)
                    .padding(.top, 16).padding(.bottom, 27)
            }.padding(.horizontal, 28)
        }.frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct PremiumTextEditor: View {
    @EnvironmentObject private var store: IdeaStore
    @Environment(\.dismiss) private var dismiss
    let existing: Idea?
    @State private var value: String
    @State private var microphone = false
    @FocusState private var focused: Bool

    init(initialText: String, existing: Idea?) {
        self.existing = existing
        _value = State(initialValue: initialText)
    }

    private var hasText: Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack {
            SoftPurpleAtmosphere(bottom: false)
            VStack(spacing: 0) {
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 17))
                            .frame(width: 40, height: 44)
                    }
                    Spacer()
                    Text(existing == nil ? "НОВАЯ МЫСЛЬ" : "РЕДАКТИРОВАТЬ")
                        .font(.system(size: 10, weight: .medium))
                        .tracking(2)
                        .foregroundStyle(Theme.muted)
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 15))
                            .frame(width: 40, height: 44)
                    }
                }
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 17).padding(.top, 13)
                VStack(alignment: .leading, spacing: 14) {
                    Text(existing == nil ? "Опиши свою\nидею..." : "Развивай\nэту мысль...")
                        .font(.system(size: 33))
                        .foregroundStyle(Theme.muted.opacity(0.70))
                        .tracking(-1)
                    Rectangle()
                        .fill(Theme.purple.opacity(focused ? 0.55 : 0.16))
                        .frame(width: focused ? 48 : 20, height: 2)
                        .animation(.easeInOut(duration: 0.33), value: focused)
                    ZStack(alignment: .topLeading) {
                        if value.isEmpty {
                            Text("Напиши всё, что приходит в голову.")
                                .font(.system(size: 19))
                                .foregroundStyle(Theme.muted.opacity(0.55))
                                .padding(.top, 9).padding(.leading, 4)
                        }
                        TextEditor(text: $value)
                            .font(.system(size: 21, weight: .regular))
                            .foregroundStyle(Theme.ink)
                            .lineSpacing(5)
                            .scrollContentBackground(.hidden)
                            .focused($focused)
                            .accessibilityLabel("Текст идеи")
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .padding(.top, 53)
                .padding(.horizontal, 29)

                HStack(spacing: 10) {
                    Button { focused = false; microphone = true } label: {
                        Image(systemName: "mic")
                            .font(.system(size: 19))
                            .frame(width: 53, height: 52)
                            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 11))
                    }.buttonStyle(.plain)
                    Button {
                        store.save(value, existing: existing)
                        dismiss()
                    } label: {
                        Text("Сохранить")
                            .font(.system(size: 15, weight: .medium))
                            .frame(maxWidth: .infinity)
                            .frame(height: 52)
                            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 11))
                    }
                    .buttonStyle(.plain).disabled(!hasText)
                    .opacity(hasText ? 1 : 0.42)
                }
                .foregroundStyle(Theme.ink)
                .padding(.horizontal, 28).padding(.bottom, 17)
            }
        }
        .onAppear { focused = true }
        .sheet(isPresented: $microphone) {
            PremiumVoiceScreen().environmentObject(store)
        }
    }
}

struct PremiumIdeasScreen: View {
    @EnvironmentObject private var store: IdeaStore
    let onCreate: () -> Void
    let onSelect: (Idea) -> Void
    @State private var query = ""
    private var ideas: [Idea] {
        store.ideas
            .filter { query.isEmpty || $0.text.localizedCaseInsensitiveContains(query) }
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 19) {
            HStack {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Твои идеи")
                        .font(.system(size: 34, weight: .regular, design: .serif))
                    Text("\(store.ideas.count) сохранено")
                        .font(.system(size: 13)).foregroundStyle(Theme.muted)
                }
                Spacer()
                Button(action: onCreate) {
                    Image(systemName: "plus")
                        .font(.system(size: 20))
                        .frame(width: 43, height: 43)
                        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 12))
                }.foregroundStyle(Theme.ink)
            }
            HStack(spacing: 12) {
                Image(systemName: "magnifyingglass")
                TextField("Найти мысль", text: $query)
                    .textInputAutocapitalization(.never)
            }
            .font(.system(size: 14))
            .foregroundStyle(Theme.muted)
            .padding(15)
            .background(Theme.panel, in: RoundedRectangle(cornerRadius: 11))

            if store.ideas.isEmpty {
                Spacer()
                VStack(spacing: 14) {
                    ThinkStar().fill(Theme.purple).frame(width: 42, height: 42)
                    Text("Тут появятся твои идеи")
                        .font(.system(size: 22, design: .serif))
                    Text("Начни с одной маленькой мысли.")
                        .font(.system(size: 14))
                        .foregroundStyle(Theme.muted)
                    Button("Создать идею", action: onCreate)
                        .buttonStyle(ThinkActionStyle())
                        .padding(.top, 14)
                }.frame(maxWidth: .infinity)
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(ideas) { idea in
                            Button { onSelect(idea) } label: {
                                VStack(alignment: .leading, spacing: 18) {
                                    HStack {
                                        ThinkStar().fill(Theme.purple).frame(width: 14, height: 14)
                                        Text("ИДЕЯ")
                                            .font(.system(size: 10, weight: .medium))
                                            .tracking(1.2)
                                        Spacer()
                                        Image(systemName: "arrow.up.right")
                                    }
                                    .foregroundStyle(Theme.muted)
                                    Text(idea.text)
                                        .font(.system(size: 17))
                                        .foregroundStyle(Theme.ink)
                                        .multilineTextAlignment(.leading).lineLimit(4)
                                    Text(idea.updatedAt, style: .date)
                                        .font(.system(size: 11))
                                        .foregroundStyle(Theme.muted)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(19)
                                .background(Theme.paper, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 0.8))
                            }.buttonStyle(.plain)
                            .contextMenu {
                                Button(role: .destructive) {
                                    store.delete(idea.id)
                                } label: {
                                    Label("Удалить", systemImage: "trash")
                                }
                            }
                        }
                    }.padding(.bottom, 15)
                }.scrollIndicators(.hidden)
            }
        }
        .foregroundStyle(Theme.ink)
        .padding(.horizontal, 27)
        .padding(.top, 32)
    }
}

struct PremiumStarsScreen: View {
    @EnvironmentObject private var store: IdeaStore
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Твои звёзды")
                    .font(.system(size: 34, weight: .regular, design: .serif))
                    .foregroundStyle(Theme.ink)
                VStack(spacing: 16) {
                    ThinkStar().fill(Theme.purple)
                        .frame(width: 50, height: 50)
                        .shadow(color: Theme.purple.opacity(0.20), radius: 22)
                    Text("\(store.stars)")
                        .font(.system(size: 73, weight: .light, design: .serif))
                        .foregroundStyle(Theme.ink)
                    Text("искр вдохновения")
                        .font(.system(size: 13))
                        .foregroundStyle(Theme.muted)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 50)
                .background(Theme.panel, in: RoundedRectangle(cornerRadius: 15))
                Text("Создавай и развивай")
                    .font(.system(size: 22, design: .serif))
                stat("Новая идея", "+5", "pencil")
                stat("Редактирование мысли", "+2", "arrow.triangle.2.circlepath")
                Text("Новые возможности за звёзды появятся позже.")
                    .font(.system(size: 13)).foregroundStyle(Theme.muted)
                    .padding(.top, 12)
            }
            .foregroundStyle(Theme.ink)
            .padding(.horizontal, 27).padding(.top, 31)
        }.scrollIndicators(.hidden)
    }
    private func stat(_ title: String, _ amount: String, _ symbol: String) -> some View {
        HStack {
            Image(systemName: symbol)
                .foregroundStyle(Theme.purple)
                .frame(width: 31)
            Text(title).font(.system(size: 15))
            Spacer()
            Text(amount).font(.system(size: 14))
                .foregroundStyle(Theme.muted)
        }.padding(.vertical, 8)
    }
}

struct PremiumIdeaDetail: View {
    @EnvironmentObject private var store: IdeaStore
    @Environment(\.dismiss) private var dismiss
    let idea: Idea
    @State private var editing = false
    @State private var qr = false
    @State private var deleteConfirm = false

    private var current: Idea {
        store.ideas.first { $0.id == idea.id } ?? idea
    }

    var body: some View {
        NavigationStack {
            ZStack {
                SoftPurpleAtmosphere()
                VStack(spacing: 0) {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 23) {
                            HStack(spacing: 8) {
                                ThinkStar().fill(Theme.purple)
                                    .frame(width: 17, height: 17)
                                Text("ТВОЯ ИДЕЯ")
                                    .font(.system(size: 11, weight: .semibold))
                                    .tracking(1.7)
                                    .foregroundStyle(Theme.muted)
                            }.padding(.top, 34)
                            Text(current.text)
                                .font(.system(size: 23, weight: .regular))
                                .lineSpacing(7)
                                .foregroundStyle(Theme.ink)
                                .textSelection(.enabled)
                            Divider().overlay(Theme.line)
                                .padding(.top, 15)
                            Text(current.createdAt, format: .dateTime.day().month(.wide).year())
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.muted)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 29)
                    }
                    HStack(spacing: 10) {
                        Button {
                            editing = true
                        } label: {
                            Label("Редактировать", systemImage: "pencil")
                        }.buttonStyle(ThinkActionStyle())
                        Button { qr = true } label: {
                            Label("Поделиться", systemImage: "square.and.arrow.up")
                        }.buttonStyle(ThinkActionStyle(filled: true))
                    }.padding(.horizontal, 26).padding(.bottom, 22)
                }
            }
            .navigationTitle("Идея")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.left")
                    }
                    .foregroundStyle(Theme.ink)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        ShareLink(item: current.text) {
                            Label("Отправить текст", systemImage: "square.and.arrow.up")
                        }
                        Button(role: .destructive) { deleteConfirm = true } label: {
                            Label("Удалить идею", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .foregroundStyle(Theme.ink)
                    }
                }
            }
        }
        .sheet(isPresented: $editing) {
            PremiumTextEditor(initialText: current.text, existing: current)
                .environmentObject(store)
        }
        .sheet(isPresented: $qr) {
            PremiumQRScreen(text: current.text)
        }
        .confirmationDialog("Удалить эту идею?", isPresented: $deleteConfirm) {
            Button("Удалить", role: .destructive) {
                store.delete(idea.id)
                dismiss()
            }
        }
    }
}
