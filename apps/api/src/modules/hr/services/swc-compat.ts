// Fontkit compatibility: @swc/helpers 0.5.x renamed camelCase helper functions to snake_case.
// Polyfill the legacy names so fontkit's decorator descriptors and properties resolve.
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const swcHelpers = require('@swc/helpers');
  if (
    swcHelpers &&
    !swcHelpers.applyDecoratedDescriptor &&
    swcHelpers._apply_decorated_descriptor
  ) {
    swcHelpers.applyDecoratedDescriptor = swcHelpers._apply_decorated_descriptor;
  }
  if (swcHelpers && !swcHelpers.defineProperty && swcHelpers._define_property) {
    swcHelpers.defineProperty = swcHelpers._define_property;
  }
} catch {
  // Ignore if @swc/helpers is absent
}
