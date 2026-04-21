export const COMPATIBLE_VERSIONS: string[] = ["0.85"];

/**
 * Checks if the provided service version string is compatible
 * with the current client application.
 *
 * @param serviceVersion The version string returned by the system service info
 * @returns true if compatible, false otherwise
 */
export const isServiceVersionCompatible = (serviceVersion: string): boolean => {
  const normalizedVersion = serviceVersion.trim();

  return COMPATIBLE_VERSIONS.some((compatVersion) =>
    normalizedVersion.startsWith(compatVersion)
  );
};
