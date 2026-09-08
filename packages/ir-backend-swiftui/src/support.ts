/**
 * Fichier de support du backend SwiftUI, un par projet (spec §9.3) :
 * `ImageSource` est le type d'un slot d'`Image`, avec l'initialiseur `Image`
 * correspondant. Le compilateur émet `Image(source: nom)`.
 */
export const SUPPORT_FILE_NAME = "ir-support.swift";

export const SUPPORT_SWIFT = `// Support minimal du backend SwiftUI, une seule fois par projet (spec §9.3).
import SwiftUI

/// Valeur d'un slot d'Image.
struct ImageSource {
  let name: String
}

extension Image {
  init(source: ImageSource) {
    self.init(source.name)
  }
}
`;
