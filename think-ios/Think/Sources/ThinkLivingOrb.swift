import SwiftUI

// A soft organic fluid sphere inspired by the user's water reference.
// Entirely vector-based so it moves continuously on the iPhone.
private struct LivingOrbContour: Shape {
    let phase: Double
    let wobble: Double

    func path(in rect: CGRect) -> Path {
        var result = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let base = min(rect.width, rect.height) * 0.46
        let samples = 128
        for i in 0...samples {
            let angle = Double(i) / Double(samples) * 2.0 * Double.pi
            let ripple = 1.0
                + wobble * sin(angle * 3 + phase * 0.68)
                + wobble * 0.34 * sin(angle * 5 - phase * 0.46)
                + wobble * 0.16 * sin(angle * 9 + phase * 0.33)
            let radius = base * ripple
            let point = CGPoint(
                x: center.x + CGFloat(cos(angle) * radius),
                y: center.y + CGFloat(sin(angle) * radius)
            )
            if i == 0 { result.move(to: point) }
            else { result.addLine(to: point) }
        }
        result.closeSubpath()
        return result
    }
}

private struct SlowSparks: View {
    let time: Double
    let outside: Bool

    private func sparkle(x: CGFloat, y: CGFloat, size: CGFloat) -> Path {
        let h = size * 0.50
        var p = Path()
        p.move(to: CGPoint(x: x, y: y - h))
        p.addQuadCurve(to: CGPoint(x: x + size * 0.18, y: y - size * 0.17),
                       control: CGPoint(x: x + size * 0.08, y: y - size * 0.12))
        p.addQuadCurve(to: CGPoint(x: x + h, y: y),
                       control: CGPoint(x: x + size * 0.27, y: y - size * 0.04))
        p.addQuadCurve(to: CGPoint(x: x + size * 0.17, y: y + size * 0.16),
                       control: CGPoint(x: x + size * 0.24, y: y + size * 0.06))
        p.addQuadCurve(to: CGPoint(x: x, y: y + h),
                       control: CGPoint(x: x + size * 0.08, y: y + size * 0.30))
        p.addQuadCurve(to: CGPoint(x: x - size * 0.17, y: y + size * 0.17),
                       control: CGPoint(x: x - size * 0.08, y: y + size * 0.29))
        p.addQuadCurve(to: CGPoint(x: x - h, y: y),
                       control: CGPoint(x: x - size * 0.26, y: y + size * 0.06))
        p.addQuadCurve(to: CGPoint(x: x - size * 0.15, y: y - size * 0.17),
                       control: CGPoint(x: x - size * 0.26, y: y - size * 0.07))
        p.addQuadCurve(to: CGPoint(x: x, y: y - h),
                       control: CGPoint(x: x - size * 0.07, y: y - size * 0.30))
        p.closeSubpath()
        return p
    }

    var body: some View {
        Canvas { context, canvas in
            let w = Double(canvas.width)
            let h = Double(canvas.height)
            let amount = outside ? 24 : 17
            for i in 0..<amount {
                let n = Double(i)
                let seed = n * 2.3999632297
                let angle = seed + time * (outside ? 0.043 : -0.072)
                let radius = outside
                    ? (0.34 + 0.12 * (0.5 + 0.5 * sin(n * 7.91)))
                    : (0.10 + 0.28 * (0.5 + 0.5 * sin(n * 7.91)))
                let driftX = 0.026 * sin(time * 0.46 + n * 0.81)
                let driftY = 0.028 * cos(time * 0.32 + n * 1.27)
                let px = w * (0.5 + cos(angle) * radius + driftX)
                let py = h * (0.5 + sin(angle) * radius + driftY)
                let shimmer = 0.42 + 0.43 * (0.5 + 0.5 * sin(time * 1.2 + n * 1.5))
                let size = CGFloat((outside ? 3.0 : 2.7) + 3.2 * (0.5 + 0.5 * sin(n * 2.17)))
                let tint: Color = outside
                    ? Color(red: 0.55, green: 0.29, blue: 0.86)
                    : Color(red: 1, green: 0.93, blue: 1)
                context.fill(sparkle(x: CGFloat(px), y: CGFloat(py), size: size),
                             with: .color(tint.opacity(shimmer)))
                if i % 3 == 0 {
                    let tiny = Path(ellipseIn: CGRect(
                        x: px + 8 * sin(time + n), y: py - 6,
                        width: 1.5, height: 1.5
                    ))
                    context.fill(tiny, with: .color(tint.opacity(shimmer * 0.70)))
                }
            }
        }.accessibilityHidden(true)
    }
}

struct ThinkLivingOrb: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            let breath = CGFloat(1 + 0.035 * sin(t * 1.42))
            ZStack {
                // The diffuse cloud gives the same soft, liquid feeling as the reference.
                Circle()
                    .fill(RadialGradient(
                        colors: [
                            Color(red: 0.83, green: 0.60, blue: 1).opacity(0.54),
                            Color(red: 0.86, green: 0.73, blue: 0.99).opacity(0.17),
                            .clear
                        ], center: .center, startRadius: 15, endRadius: 166
                    ))
                    .frame(width: 318, height: 318)
                    .blur(radius: 16)
                    .scaleEffect(1 + 0.035 * sin(t * 1.42 + 0.7))

                SlowSparks(time: t, outside: true)
                    .frame(width: 307, height: 307)

                ZStack {
                    LivingOrbContour(phase: t, wobble: reduceMotion ? 0 : 0.043)
                        .fill(RadialGradient(
                            colors: [
                                Color(red: 0.998, green: 0.966, blue: 1),
                                Color(red: 0.79, green: 0.55, blue: 0.98),
                                Color(red: 0.58, green: 0.25, blue: 0.89),
                                Color(red: 0.28, green: 0.11, blue: 0.53)
                            ],
                            center: UnitPoint(
                                x: 0.28 + 0.12 * sin(t * 0.20),
                                y: 0.26 + 0.08 * cos(t * 0.16)
                            ),
                            startRadius: 6, endRadius: 146
                        ))
                    Ellipse()
                        .fill(LinearGradient(colors: [
                            .white.opacity(0.92),
                            Color(red: 0.98, green: 0.76, blue: 1).opacity(0.65),
                            Color(red: 0.54, green: 0.26, blue: 0.87).opacity(0.02)
                        ], startPoint: .top, endPoint: .bottom))
                        .frame(width: 231, height: 82)
                        .rotationEffect(.degrees(-18 + sin(t * 0.50) * 21))
                        .offset(x: CGFloat(12 * sin(t * 0.39)),
                                y: CGFloat(29 + 27 * sin(t * 0.47)))
                        .blur(radius: 16)
                        .blendMode(.screen)

                    Ellipse()
                        .fill(Color.white.opacity(0.43))
                        .frame(width: 112, height: 38)
                        .rotationEffect(.degrees(-28))
                        .offset(x: -29 + CGFloat(9 * sin(t * 0.43)), y: -64)
                        .blur(radius: 19)

                    SlowSparks(time: t, outside: false)
                        .frame(width: 224, height: 224)
                }
                .frame(width: 224, height: 224)
                .mask(LivingOrbContour(phase: t, wobble: reduceMotion ? 0 : 0.043))
                .overlay {
                    LivingOrbContour(phase: t, wobble: reduceMotion ? 0 : 0.043)
                        .stroke(Color.white.opacity(0.55), lineWidth: 1.1)
                        .frame(width: 224, height: 224)
                }
                .shadow(color: Color(red: 0.51, green: 0.23, blue: 0.84).opacity(0.24),
                        radius: 27, y: 14)
                .scaleEffect(breath)
            }
        }
        .frame(width: 320, height: 310)
        .accessibilityLabel("Живой пурпурный шар со звёздами, которые плавно движутся внутри и вокруг")
    }
}
