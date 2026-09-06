// Généré depuis tokens.json + tokens.dark.json par le compilateur de tokens, cible SwiftUI. Ne pas éditer.
// Nommage : $groupe.sous.nom -> T.groupe.sous.nom. Les primitives (palette, font) ne sont pas émises.
// Le mode sombre est résolu par UIColor dynamique : l'IR et le code généré n'en savent rien.

import SwiftUI

enum T {

  enum space {
    static let none: CGFloat = 0
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let lg: CGFloat = 24
    static let xl: CGFloat = 32
  }

  enum size {
    static let hairline: CGFloat = 1
    enum icon {
      static let sm: CGFloat = 16
      static let md: CGFloat = 24
      static let lg: CGFloat = 32
    }
  }

  enum radius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 8
    static let lg: CGFloat = 16
    static let full: CGFloat = 999
  }

  enum bp {
    static let compact: CGFloat = 0
    static let expanded: CGFloat = 600
  }

  enum opacity {
    static let disabled: Double = 0.4
    static let muted: Double = 0.7
  }

  enum color {
    enum bg {
      static let canvas = Color(light: 0xFFFFFF, dark: 0x1C1C1A)
      static let field  = Color(light: 0xF7F7F5, dark: 0x44443F)
    }
    enum text {
      static let primary   = Color(light: 0x1C1C1A, dark: 0xFFFFFF)
      static let secondary = Color(light: 0x7A7975, dark: 0xC9C7C0)
      static let onAccent  = Color(light: 0xFFFFFF, dark: 0xFFFFFF)
    }
    static let accent = Color(light: 0x2F6FDE, dark: 0x2F6FDE)
    enum border {
      static let `default` = Color(light: 0xC9C7C0, dark: 0x44443F)
    }
  }

  enum type {
    enum heading {
      static let lg = Font.custom("Inter", size: 28).weight(.semibold)
      static let md = Font.custom("Inter", size: 22).weight(.semibold)
    }
    enum body {
      static let md = Font.custom("Inter", size: 16).weight(.regular)
      static let sm = Font.custom("Inter", size: 14).weight(.regular)
    }
    enum label {
      static let md = Font.custom("Inter", size: 15).weight(.medium)
    }
    // lineHeight et letterSpacing des tokens composites sont appliqués par le compilateur
    // via .lineSpacing et .tracking sur chaque Text, à partir des valeurs ci-dessous.
    enum metrics {
      static let headingLg = (lineHeight: 1.214, tracking: -0.4)
      static let headingMd = (lineHeight: 1.273, tracking: -0.2)
      static let bodyMd    = (lineHeight: 1.5,   tracking: 0.0)
      static let bodySm    = (lineHeight: 1.429, tracking: 0.0)
      static let labelMd   = (lineHeight: 1.333, tracking: 0.1)
    }
  }

  enum shadow {
    static let sm = (color: Color.black.opacity(0.08), darkColor: Color.black.opacity(0.4), x: CGFloat(0), y: CGFloat(1), blur: CGFloat(2))
    static let md = (color: Color.black.opacity(0.12), darkColor: Color.black.opacity(0.5), x: CGFloat(0), y: CGFloat(4), blur: CGFloat(12))
  }

  enum icon {
    static let help = "questionmark.circle"
    static let check = "checkmark"
    static let close = "xmark"
    static let chevronRight = "chevron.right"
    static let search = "magnifyingglass"
  }
}

// Support minimal, une seule fois par projet, fourni par le support library du backend.
extension Color {
  init(light: UInt32, dark: UInt32) {
    self.init(UIColor { trait in
      let hex = trait.userInterfaceStyle == .dark ? dark : light
      return UIColor(
        red:   CGFloat((hex >> 16) & 0xFF) / 255,
        green: CGFloat((hex >> 8) & 0xFF) / 255,
        blue:  CGFloat(hex & 0xFF) / 255,
        alpha: 1)
    })
  }
}
