import SwiftUI

/// A procedural light sphere. Every highlight and ribbon is drawn in real time:
/// no prerecorded movie, static render, or remote asset is used.
struct ThinkLivingOrb: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0,
                                paused: scenePhase != .active)) { timeline in
            let elapsed = timeline.date.timeIntervalSinceReferenceDate
            Canvas(opaque: false, colorMode: .linear) { context, size in
                let center = CGPoint(x: size.width * 0.5, y: size.height * 0.5)
                let radius = min(size.width, size.height) * 0.405
                let t = reduceMotion ? 0 : elapsed
                let cycle = (t.truncatingRemainder(dividingBy: 10) / 10) * 2 * Double.pi
                let pulse = 0.5 + 0.5 * cos(cycle)
                let reveal = 0.12 + 0.88 * pow(pulse, 1.15)

                drawAtmosphere(in: &context, center: center, radius: radius, time: t)
                drawSphere(in: &context, center: center, radius: radius, time: t, reveal: reveal)
                drawRibbons(in: &context, center: center, radius: radius, time: t, reveal: reveal)
                drawOrbitSparks(in: &context, center: center, radius: radius, time: t, reveal: reveal)
                drawRim(in: &context, center: center, radius: radius, time: t, reveal: reveal)
            }
            .drawingGroup(opaque: false, colorMode: .linear)
            .accessibilityHidden(true)
        }
        .accessibilityLabel("Светящийся шар Think с движущимися потоками света")
    }

    private func drawAtmosphere(in context: inout GraphicsContext,
                                center: CGPoint, radius: CGFloat, time: Double) {
        let breathe = 1 + 0.035 * sin(time * 0.62)
        let rect = CGRect(x: center.x - radius * 1.48 * breathe,
                          y: center.y - radius * 1.48 * breathe,
                          width: radius * 2.96 * breathe,
                          height: radius * 2.96 * breathe)
        context.fill(
            Path(ellipseIn: rect),
            with: .radialGradient(
                Gradient(colors: [
                    Color(red: 0.48, green: 0.24, blue: 0.92).opacity(0.25),
                    Color(red: 0.22, green: 0.57, blue: 1.0).opacity(0.11),
                    Color(red: 0.94, green: 0.34, blue: 0.78).opacity(0.08),
                    .clear
                ]),
                center: center,
                startRadius: radius * 0.25,
                endRadius: radius * 1.48 * breathe
            )
        )
    }

    private func drawSphere(in context: inout GraphicsContext,
                            center: CGPoint, radius: CGFloat,
                            time: Double, reveal: Double) {
        let rect = CGRect(x: center.x - radius, y: center.y - radius,
                          width: radius * 2, height: radius * 2)
        let sphere = Path(ellipseIn: rect)
        let light = CGPoint(x: center.x - radius * 0.27 + CGFloat(0.035 * sin(time * 0.22)) * radius,
                            y: center.y - radius * 0.36)
        context.fill(
            sphere,
            with: .radialGradient(
                Gradient(colors: [
                    Color(red: 0.12, green: 0.10, blue: 0.22),
                    Color(red: 0.045, green: 0.035, blue: 0.095),
                    Color(red: 0.012, green: 0.018, blue: 0.045),
                    Color(red: 0.025, green: 0.018, blue: 0.055)
                ]),
                center: light,
                startRadius: 1,
                endRadius: radius * 1.32
            )
        )

        var shade = context
        shade.clip(to: sphere)
        let sheen = Path(ellipseIn: CGRect(
            x: center.x - radius * 0.95,
            y: center.y - radius * 1.03,
            width: radius * 1.38,
            height: radius * 0.68
        ))
        shade.fill(
            sheen,
            with: .linearGradient(
                Gradient(colors: [
                    .white.opacity(0.18 * reveal),
                    Color(red: 0.56, green: 0.67, blue: 1).opacity(0.055 * reveal),
                    .clear
                ]),
                startPoint: CGPoint(x: center.x - radius, y: center.y - radius),
                endPoint: CGPoint(x: center.x + radius * 0.45, y: center.y - radius * 0.15)
            )
        )
    }

    private func drawRibbons(in context: inout GraphicsContext,
                             center: CGPoint, radius: CGFloat,
                             time: Double, reveal: Double) {
        let palette: [[Color]] = [
            [
                Color(red: 0.24, green: 0.75, blue: 1.0),
                Color(red: 0.67, green: 0.43, blue: 1.0),
                Color(red: 1.0, green: 0.43, blue: 0.79),
                Color(red: 1.0, green: 0.84, blue: 0.98)
            ],
            [
                Color(red: 0.94, green: 0.37, blue: 0.78),
                Color(red: 0.58, green: 0.45, blue: 1.0),
                Color(red: 0.28, green: 0.77, blue: 1.0),
                Color(red: 0.88, green: 0.75, blue: 1.0)
            ],
            [
                Color(red: 0.36, green: 0.62, blue: 1.0),
                Color(red: 0.91, green: 0.45, blue: 0.94),
                Color(red: 1.0, green: 0.68, blue: 0.84)
            ]
        ]

        let sphere = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius,
                                            width: radius * 2, height: radius * 2))
        var clipped = context
        clipped.clip(to: sphere)

        for index in 0..<3 {
            let phase = time * (0.42 + Double(index) * 0.075) + Double(index) * 2.05
            let path = flowingRibbon(center: center, radius: radius * (0.78 - CGFloat(index) * 0.055),
                                     phase: phase, index: index)
            let colors = palette[index]
            let gradient = GraphicsContext.Shading.linearGradient(
                Gradient(colors: colors.map { $0.opacity(0.92 * reveal) }),
                startPoint: CGPoint(x: center.x - radius, y: center.y - radius * 0.55),
                endPoint: CGPoint(x: center.x + radius, y: center.y + radius * 0.62)
            )

            clipped.drawLayer { glow in
                glow.addFilter(.blur(radius: radius * 0.105))
                glow.stroke(path, with: gradient,
                            style: StrokeStyle(lineWidth: radius * 0.145,
                                               lineCap: .round, lineJoin: .round))
            }
            clipped.drawLayer { bloom in
                bloom.addFilter(.blur(radius: radius * 0.035))
                bloom.stroke(path, with: gradient,
                             style: StrokeStyle(lineWidth: radius * 0.052,
                                                lineCap: .round, lineJoin: .round))
            }
            clipped.stroke(
                path,
                with: .linearGradient(
                    Gradient(colors: [
                        .white.opacity(0.92 * reveal),
                        colors[0].opacity(0.95 * reveal),
                        colors[1].opacity(0.95 * reveal),
                        colors[2].opacity(0.98 * reveal),
                        .white.opacity(0.82 * reveal)
                    ]),
                    startPoint: CGPoint(x: center.x - radius, y: center.y - radius * 0.7),
                    endPoint: CGPoint(x: center.x + radius, y: center.y + radius * 0.7)
                ),
                style: StrokeStyle(lineWidth: max(1.15, radius * 0.014),
                                   lineCap: .round, lineJoin: .round)
            )
        }

        // A moving bright knot makes the light paths feel connected and alive.
        let knot = CGPoint(
            x: center.x + CGFloat(cos(time * 0.48)) * radius * 0.13,
            y: center.y + CGFloat(sin(time * 0.61)) * radius * 0.12
        )
        let knotRect = CGRect(x: knot.x - radius * 0.085, y: knot.y - radius * 0.085,
                              width: radius * 0.17, height: radius * 0.17)
        clipped.drawLayer { glow in
            glow.addFilter(.blur(radius: radius * 0.10))
            glow.fill(Path(ellipseIn: knotRect), with: .color(Color(red: 0.98, green: 0.65, blue: 1).opacity(0.95 * reveal)))
        }
        clipped.fill(Path(ellipseIn: knotRect.insetBy(dx: radius * 0.045, dy: radius * 0.045)),
                     with: .color(.white.opacity(0.85 * reveal)))
    }

    private func flowingRibbon(center: CGPoint, radius: CGFloat,
                               phase: Double, index: Int) -> Path {
        var path = Path()
        let steps = 150
        let direction = index == 1 ? -1.0 : 1.0
        for step in 0...steps {
            let u = Double(step) / Double(steps)
            let angle = u * 2 * Double.pi
            let waveA = sin(angle * 2 + phase * direction)
            let waveB = cos(angle * 3 - phase * 0.72 + Double(index))
            let waveC = sin(angle * 1.5 + phase * 0.48)
            let radial = Double(radius) * (0.48 + 0.17 * waveA + 0.095 * waveB)
            let x = center.x + CGFloat(cos(angle + phase * 0.16) * radial)
            let y = center.y + CGFloat(sin(angle + phase * 0.16) * radial * (0.74 + 0.08 * waveC))
            let point = CGPoint(x: x, y: y)
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }

    private func drawOrbitSparks(in context: inout GraphicsContext,
                                 center: CGPoint, radius: CGFloat,
                                 time: Double, reveal: Double) {
        for index in 0..<9 {
            let n = Double(index)
            let angle = n * 2.39996 + time * (index.isMultiple(of: 2) ? 0.13 : -0.10)
            let orbit = Double(radius) * (0.76 + 0.12 * sin(n * 1.8 + time * 0.2))
            let point = CGPoint(x: center.x + CGFloat(cos(angle)) * CGFloat(orbit),
                                y: center.y + CGFloat(sin(angle)) * CGFloat(orbit))
            let starSize = CGFloat(2.0 + 2.2 * (0.5 + 0.5 * sin(time * 1.1 + n)))
            let star = fourPointStar(at: point, size: starSize)
            let tint = index.isMultiple(of: 2)
                ? Color(red: 0.47, green: 0.75, blue: 1)
                : Color(red: 1, green: 0.62, blue: 0.86)
            context.drawLayer { glow in
                glow.addFilter(.blur(radius: 5))
                glow.fill(star, with: .color(tint.opacity(0.78 * reveal)))
            }
            context.fill(star, with: .color(.white.opacity(0.9 * reveal)))
        }
    }

    private func drawRim(in context: inout GraphicsContext,
                         center: CGPoint, radius: CGFloat,
                         time: Double, reveal: Double) {
        let sphere = Path(ellipseIn: CGRect(x: center.x - radius, y: center.y - radius,
                                            width: radius * 2, height: radius * 2))
        let colors = [
            Color(red: 0.40, green: 0.76, blue: 1.0),
            Color(red: 0.78, green: 0.57, blue: 1.0),
            Color(red: 1.0, green: 0.55, blue: 0.82),
            Color(red: 0.78, green: 0.72, blue: 1.0),
            Color(red: 0.40, green: 0.76, blue: 1.0)
        ].map { $0.opacity(0.58 + 0.35 * reveal) }
        let gradient = GraphicsContext.Shading.linearGradient(
            Gradient(colors: colors),
            startPoint: CGPoint(x: center.x - radius, y: center.y - radius),
            endPoint: CGPoint(x: center.x + radius, y: center.y + radius)
        )
        context.drawLayer { glow in
            glow.addFilter(.blur(radius: 13 + 2 * sin(time * 0.8)))
            glow.stroke(sphere, with: gradient, lineWidth: 5.5)
        }
        context.stroke(sphere, with: gradient, lineWidth: 1.35)

        // Small specular glint that travels along the upper-left rim.
        let glintAngle = -2.1 + 0.18 * sin(time * 0.35)
        let glintCenter = CGPoint(x: center.x + CGFloat(cos(glintAngle)) * radius,
                                  y: center.y + CGFloat(sin(glintAngle)) * radius)
        let glint = Path(ellipseIn: CGRect(x: glintCenter.x - 3.2, y: glintCenter.y - 3.2,
                                           width: 6.4, height: 6.4))
        context.drawLayer { glow in
            glow.addFilter(.blur(radius: 8))
            glow.fill(glint, with: .color(.white.opacity(0.85)))
        }
    }

    private func fourPointStar(at center: CGPoint, size: CGFloat) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: center.x, y: center.y - size))
        path.addQuadCurve(to: CGPoint(x: center.x + size, y: center.y),
                          control: CGPoint(x: center.x + size * 0.17, y: center.y - size * 0.17))
        path.addQuadCurve(to: CGPoint(x: center.x, y: center.y + size),
                          control: CGPoint(x: center.x + size * 0.17, y: center.y + size * 0.17))
        path.addQuadCurve(to: CGPoint(x: center.x - size, y: center.y),
                          control: CGPoint(x: center.x - size * 0.17, y: center.y + size * 0.17))
        path.addQuadCurve(to: CGPoint(x: center.x, y: center.y - size),
                          control: CGPoint(x: center.x - size * 0.17, y: center.y - size * 0.17))
        path.closeSubpath()
        return path
    }
}
