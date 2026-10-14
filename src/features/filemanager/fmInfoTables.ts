/** Names and plain-words meanings of EXIF tags and values. Data only. */

export const IFD0_TAGS: Record<number, string> = {
  0x0100: "ImageWidth", 0x0101: "ImageLength", 0x0102: "BitsPerSample", 0x0103: "Compression", 0x0106: "PhotometricInterpretation",
  0x010e: "ImageDescription", 0x010f: "Make", 0x0110: "Model", 0x0111: "StripOffsets", 0x0112: "Orientation", 0x0115: "SamplesPerPixel",
  0x0116: "RowsPerStrip", 0x0117: "StripByteCounts", 0x011a: "XResolution", 0x011b: "YResolution", 0x011c: "PlanarConfiguration",
  0x0128: "ResolutionUnit", 0x0131: "Software", 0x0132: "DateTime", 0x013b: "Artist", 0x013c: "HostComputer", 0x0142: "TileWidth", 0x0143: "TileLength",
  0x0201: "ThumbnailOffset", 0x0202: "ThumbnailLength", 0x0213: "YCbCrPositioning", 0x02bc: "XMP", 0x8298: "Copyright",
  0x83bb: "IPTC-NAA", 0x8649: "Photoshop", 0x8769: "ExifIFD", 0x8773: "ICC_Profile", 0x8825: "GPSIFD",
};

export const EXIF_TAGS: Record<number, string> = {
  0x829a: "ExposureTime", 0x829d: "FNumber", 0x8822: "ExposureProgram", 0x8827: "ISOSpeedRatings", 0x8830: "SensitivityType",
  0x8832: "RecommendedExposureIndex", 0x9000: "ExifVersion", 0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized",
  0x9010: "OffsetTime", 0x9011: "OffsetTimeOriginal", 0x9012: "OffsetTimeDigitized", 0x9101: "ComponentsConfiguration",
  0x9201: "ShutterSpeedValue", 0x9202: "ApertureValue", 0x9203: "BrightnessValue", 0x9204: "ExposureBiasValue", 0x9205: "MaxApertureValue",
  0x9206: "SubjectDistance", 0x9207: "MeteringMode", 0x9208: "LightSource", 0x9209: "Flash", 0x920a: "FocalLength",
  0x927c: "MakerNote", 0x9286: "UserComment", 0x9290: "SubSecTime", 0x9291: "SubSecTimeOriginal", 0x9292: "SubSecTimeDigitized",
  0xa000: "FlashpixVersion", 0xa001: "ColorSpace", 0xa002: "PixelXDimension", 0xa003: "PixelYDimension", 0xa005: "InteropIFD",
  0xa20e: "FocalPlaneXResolution", 0xa20f: "FocalPlaneYResolution", 0xa210: "FocalPlaneResolutionUnit", 0xa217: "SensingMethod",
  0xa300: "FileSource", 0xa301: "SceneType", 0xa401: "CustomRendered", 0xa402: "ExposureMode", 0xa403: "WhiteBalance",
  0xa404: "DigitalZoomRatio", 0xa405: "FocalLengthIn35mmFilm", 0xa406: "SceneCaptureType", 0xa407: "GainControl", 0xa408: "Contrast",
  0xa409: "Saturation", 0xa40a: "Sharpness", 0xa40c: "SubjectDistanceRange", 0xa420: "ImageUniqueID", 0xa430: "CameraOwnerName",
  0xa431: "BodySerialNumber", 0xa432: "LensSpecification", 0xa433: "LensMake", 0xa434: "LensModel", 0xa435: "LensSerialNumber",
};

export const GPS_TAGS: Record<number, string> = {
  0: "GPSVersionID", 1: "GPSLatitudeRef", 2: "GPSLatitude", 3: "GPSLongitudeRef", 4: "GPSLongitude", 5: "GPSAltitudeRef", 6: "GPSAltitude",
  7: "GPSTimeStamp", 8: "GPSSatellites", 9: "GPSStatus", 10: "GPSMeasureMode", 11: "GPSDOP", 12: "GPSSpeedRef", 13: "GPSSpeed",
  14: "GPSTrackRef", 15: "GPSTrack", 16: "GPSImgDirectionRef", 17: "GPSImgDirection", 18: "GPSMapDatum", 19: "GPSDestLatitudeRef",
  20: "GPSDestLatitude", 21: "GPSDestLongitudeRef", 22: "GPSDestLongitude", 29: "GPSDateStamp", 30: "GPSDifferential",
};

export const INTEROP_TAGS: Record<number, string> = { 1: "InteropIndex", 2: "InteropVersion" };

type Names = Record<number, string>;

export const ORIENTATION: Names = {
  1: "Normal", 2: "Mirrored", 3: "Upside down (rotated 180°)", 4: "Mirrored upside down", 5: "Mirrored, turned 90° left", 6: "Turned 90° right (clockwise)",
  7: "Mirrored, turned 90° right", 8: "Turned 90° left (counter-clockwise)",
};
export const RESOLUTION_UNIT: Names = { 1: "no unit", 2: "inch", 3: "centimetre" };
export const COLOR_SPACE: Names = { 1: "sRGB", 2: "Adobe RGB", 0xfffd: "Wide gamut RGB", 0xffff: "Not calibrated" };
export const EXPOSURE_PROGRAM: Names = { 0: "Not defined", 1: "Manual", 2: "Normal program", 3: "Aperture priority", 4: "Shutter priority", 5: "Creative (slow)", 6: "Action (fast)", 7: "Portrait", 8: "Landscape" };
export const METERING: Names = { 0: "Unknown", 1: "Average", 2: "Centre-weighted", 3: "Spot", 4: "Multi-spot", 5: "Pattern (matrix)", 6: "Partial", 255: "Other" };
export const EXPOSURE_MODE: Names = { 0: "Auto", 1: "Manual", 2: "Auto bracket" };
export const WHITE_BALANCE: Names = { 0: "Auto", 1: "Manual" };
export const SCENE_TYPE: Names = { 0: "Standard", 1: "Landscape", 2: "Portrait", 3: "Night" };
export const SENSING: Names = { 1: "Not defined", 2: "One-chip colour sensor", 3: "Two-chip colour sensor", 4: "Three-chip colour sensor", 5: "Colour sequential area sensor", 7: "Trilinear sensor", 8: "Colour sequential linear sensor" };
export const LIGHT_SOURCE: Names = { 0: "Unknown", 1: "Daylight", 2: "Fluorescent", 3: "Tungsten (incandescent)", 4: "Flash", 9: "Fine weather", 10: "Cloudy", 11: "Shade", 17: "Standard light A", 18: "Standard light B", 19: "Standard light C", 20: "D55", 21: "D65", 22: "D75", 255: "Other" };
export const COMPRESSION_TIFF: Names = { 1: "None", 2: "CCITT 1D", 3: "CCITT Group 3", 4: "CCITT Group 4", 5: "LZW", 6: "JPEG (old)", 7: "JPEG", 8: "Deflate (Adobe)", 32773: "PackBits", 32946: "Deflate", 34712: "JPEG 2000", 34925: "LZMA", 50000: "Zstandard", 50001: "WebP" };
export const PHOTOMETRIC: Names = { 0: "White is zero", 1: "Black is zero", 2: "RGB", 3: "Palette", 4: "Transparency mask", 5: "CMYK", 6: "YCbCr", 8: "CIE L*a*b*" };

/** The Flash tag is a bit field: bit 0 fired, bits 1-2 return light, bits 3-4 mode, bit 5 no flash function, bit 6 red-eye. */
export function flashText(v: number): string {
  const fired = (v & 1) !== 0;
  const mode = (v >> 3) & 3;
  const parts = [fired ? "Flash fired" : "Flash did not fire"];
  if (mode === 1) parts.push("compulsory");
  else if (mode === 2) parts.push("suppressed");
  else if (mode === 3) parts.push("auto");
  if ((v & 0x20) !== 0) parts.push("no flash function");
  if ((v & 0x40) !== 0) parts.push("red-eye reduction");
  const ret = (v >> 1) & 3;
  if (ret === 2) parts.push("no return light detected");
  else if (ret === 3) parts.push("return light detected");
  return parts.join(", ");
}

export const name = (table: Names, v: number): string => table[v] ?? `Code ${v}`;
