import type { GlobalThemeOverrides } from 'naive-ui'

/** 深色模式下的通用色，与 style.css 中 .dark 的 --ui-* 变量保持一致。 */
const DARK_COMMON = {
  primaryColor: '#5aa077',
  primaryColorHover: '#6fb38b',
  primaryColorPressed: '#4a8c66',
  primaryColorSuppl: '#5aa077',
  infoColor: '#79a9c1',
  successColor: '#5aa077',
  warningColor: '#d4a159',
  errorColor: '#d9787f',
  bodyColor: '#141c18',
  cardColor: '#202c25',
  modalColor: '#202c25',
  popoverColor: '#28372e',
  inputColor: '#19251e',
  tableColor: 'transparent',
  tableHeaderColor: '#25332b',
  textColorBase: '#e3ece5',
  textColor1: '#e3ece5',
  textColor2: '#acbcb0',
  textColor3: '#819487',
  borderColor: 'rgba(179, 204, 186, 0.18)',
  dividerColor: 'rgba(179, 204, 186, 0.14)',
  boxShadow1: '0 2px 10px rgba(0, 0, 0, 0.25)',
  boxShadow2: '0 12px 32px rgba(0, 0, 0, 0.32)',
  boxShadow3: '0 24px 64px rgba(0, 0, 0, 0.4)',
}

export function createNaiveThemeOverrides(dark = false): GlobalThemeOverrides {
  const light = createLightOverrides()
  if (!dark)
    return light
  return {
    ...light,
    common: { ...light.common, ...DARK_COMMON },
    Tabs: { ...light.Tabs, tabColorSegment: '#25332b' },
    DataTable: {
      borderColor: 'rgba(179, 204, 186, 0.14)',
      thColor: '#25332b',
      thColorHover: '#2b3a31',
      tdColorHover: '#25332b',
    },
    Switch: { ...light.Switch, railColorActive: '#5aa077' },
    Modal: { boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)' },
  }
}

function createLightOverrides(): GlobalThemeOverrides {
  return {
    common: {
      primaryColor: '#438d63',
      primaryColorHover: '#367b54',
      primaryColorPressed: '#2d6948',
      primaryColorSuppl: '#5aa077',
      infoColor: '#5c8fa8',
      successColor: '#438d63',
      warningColor: '#c58b3f',
      errorColor: '#c95f66',
      bodyColor: '#f3f5ef',
      cardColor: 'rgba(255, 255, 255, 0.82)',
      modalColor: 'rgba(255, 255, 255, 0.94)',
      popoverColor: 'rgba(255, 255, 255, 0.94)',
      inputColor: 'rgba(255, 255, 255, 0.72)',
      tableColor: 'transparent',
      tableHeaderColor: 'rgba(237, 243, 236, 0.88)',
      textColorBase: '#243028',
      textColor1: '#243028',
      textColor2: '#667269',
      textColor3: '#89928b',
      borderColor: 'rgba(58, 86, 68, 0.13)',
      dividerColor: 'rgba(58, 86, 68, 0.11)',
      borderRadius: '8px',
      borderRadiusSmall: '6px',
      heightSmall: '32px',
      heightMedium: '38px',
      heightLarge: '42px',
      fontFamily: 'Inter, "Microsoft YaHei", "PingFang SC", ui-sans-serif, system-ui, sans-serif',
      fontFamilyMono: '"Cascadia Mono", "SFMono-Regular", Consolas, monospace',
      fontWeight: '400',
      fontWeightStrong: '600',
      boxShadow1: '0 2px 10px rgba(55, 75, 61, 0.06)',
      boxShadow2: '0 12px 32px rgba(55, 75, 61, 0.1)',
      boxShadow3: '0 24px 64px rgba(55, 75, 61, 0.14)',
    },
    Button: {
      heightSmall: '32px',
      heightMedium: '38px',
      heightLarge: '42px',
      borderRadiusSmall: '9px',
      borderRadiusMedium: '10px',
      borderRadiusLarge: '11px',
      fontSizeSmall: '13px',
      fontSizeMedium: '14px',
      fontSizeLarge: '15px',
      fontWeight: '600',
    },
    Input: {
      heightSmall: '32px',
      heightMedium: '38px',
      heightLarge: '42px',
      borderRadius: '10px',
    },
    Select: {
      peers: {
        InternalSelection: {
          borderRadius: '10px',
        },
      },
    },
    Card: {
      borderRadius: '8px',
      titleFontWeight: '600',
      boxShadow: '0 10px 30px rgba(55, 75, 61, 0.08)',
    },
    Tabs: {
      tabColorSegment: 'rgba(232, 241, 233, 0.88)',
      tabBorderRadius: '10px',
      tabFontWeightActive: '600',
    },
    DataTable: {
      borderColor: 'rgba(58, 86, 68, 0.1)',
      thColor: 'rgba(237, 243, 236, 0.88)',
      thColorHover: 'rgba(232, 240, 233, 0.94)',
      tdColorHover: 'rgba(239, 246, 240, 0.72)',
    },
    Dialog: {
      borderRadius: '12px',
    },
    Modal: {
      boxShadow: '0 24px 64px rgba(55, 75, 61, 0.16)',
    },
    Switch: {
      railColorActive: '#438d63',
      boxShadowFocus: '0 0 0 3px rgba(67, 141, 99, 0.16)',
    },
  }
}
