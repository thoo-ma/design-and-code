// Généré depuis Login.ir par ir-backend-swiftui. Ne pas éditer : zone générée (spec §9).
import SwiftUI

struct LoginLayout: View {
  let subtitle: String

  var body: some View {
    VStack(spacing: T.space.md) {
      Spacer(minLength: 0)
      Text("Bienvenue")
        .font(T.type.heading.lg).foregroundStyle(T.color.text.primary)
        .accessibilityAddTraits(.isHeader)
        .frame(maxWidth: .infinity)
        .irNode("title")
      Text(subtitle)
        .font(T.type.body.md).foregroundStyle(T.color.text.secondary)
        .lineLimit(2)
        .frame(maxWidth: .infinity)
        .irNode("subtitle")
      VStack(spacing: T.space.sm) {
        RoundedRectangle(cornerRadius: T.radius.md)
          .fill(T.color.bg.field)
          .frame(height: 48)
          .overlay(RoundedRectangle(cornerRadius: T.radius.md).stroke(T.color.border.`default`, lineWidth: T.size.hairline))
          .accessibilityLabel("Email")
          .frame(maxWidth: .infinity)
          .irNode("email")
        RoundedRectangle(cornerRadius: T.radius.md)
          .fill(T.color.bg.field)
          .frame(height: 48)
          .overlay(RoundedRectangle(cornerRadius: T.radius.md).stroke(T.color.border.`default`, lineWidth: T.size.hairline))
          .accessibilityLabel("Mot de passe")
          .frame(maxWidth: .infinity)
          .irNode("password")
      }
      .frame(maxWidth: .infinity)
      .irNode("form")
      HStack(alignment: .center, spacing: T.space.sm) {
        HStack(alignment: .center) {
          Spacer(minLength: 0)
          Text("Continuer")
            .font(T.type.label.md).foregroundStyle(T.color.text.onAccent)
            .irNode("primaryLabel")
          Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 48)
        .background(T.color.accent, in: RoundedRectangle(cornerRadius: T.radius.md))
        .accessibilityAddTraits(.isButton)
        .irNode("primary")
        Image(systemName: T.icon.help).font(.system(size: T.size.icon.md))
          .foregroundStyle(T.color.text.secondary)
          .irNode("help")
      }
      .frame(maxWidth: .infinity)
      .irNode("actions")
      Spacer(minLength: 0)
    }
    .padding(sizeClass == .compact ? T.space.lg : T.space.xl)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .frame(maxWidth: sizeClass == .compact ? nil : 480)
    .background(T.color.bg.canvas)
    .irNode("root")
  }

  @Environment(\.horizontalSizeClass) private var sizeClass
}

#Preview { LoginLayout(subtitle: "Connectez-vous pour continuer") }
