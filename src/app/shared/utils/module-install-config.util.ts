export type ModuleInstallKey =
  | 'docs'
  | 'knowledge'
  | 'moves'
  | 'network'
  | 'outreach'
  | 'pulse'
  | 'say-it';

export interface ModuleInstallConfig {
  key: ModuleInstallKey;
  moduleName: string;
  installLabel: string;
  marketingEntryPath: string;
  launchRoute: string;
  manifestPath: string;
  iconPath: string;
  themeColor: string;
  iosInstructionTitle: string;
  iosInstructionSteps: string[];
}

const MODULE_INSTALL_CONFIGS: Record<ModuleInstallKey, ModuleInstallConfig> = {
  docs: {
    key: 'docs',
    moduleName: 'Docs',
    installLabel: 'Install Docs',
    marketingEntryPath: '/docs/',
    launchRoute: '/docs/app',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/docs/docs.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Docs on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Docs.'
    ]
  },
  knowledge: {
    key: 'knowledge',
    moduleName: 'Knowledge Base',
    installLabel: 'Install Knowledge',
    marketingEntryPath: '/knowledge/',
    launchRoute: '/knowledge-base',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/knowledge/knowledge.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Knowledge on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Knowledge.'
    ]
  },
  moves: {
    key: 'moves',
    moduleName: 'Moves',
    installLabel: 'Install Moves',
    marketingEntryPath: '/moves/',
    launchRoute: '/moves/app',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/moves/moves.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Moves on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Moves.'
    ]
  },
  network: {
    key: 'network',
    moduleName: 'Network',
    installLabel: 'Install Network',
    marketingEntryPath: '/network/',
    launchRoute: '/network/app',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/network/network.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Network on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Network.'
    ]
  },
  outreach: {
    key: 'outreach',
    moduleName: 'Outreach',
    installLabel: 'Install Outreach',
    marketingEntryPath: '/outreach/',
    launchRoute: '/outreach/app',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/outreach/outreach.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Outreach on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Outreach.'
    ]
  },
  pulse: {
    key: 'pulse',
    moduleName: 'Pulse',
    installLabel: 'Install Pulse',
    marketingEntryPath: '/pulse/',
    launchRoute: '/pulse/app',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/pulse/pulse.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Pulse on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Pulse.'
    ]
  },
  'say-it': {
    key: 'say-it',
    moduleName: 'Say It',
    installLabel: 'Install Say It',
    marketingEntryPath: '/say-it/',
    launchRoute: '/say-it/app',
    manifestPath: '/manifest.webmanifest',
    iconPath: '/assets/sayit/sayit.png',
    themeColor: '#0b0b0f',
    iosInstructionTitle: 'Install Say It on your iPhone or iPad',
    iosInstructionSteps: [
      'Open this page in Safari.',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap Add to Home Screen.',
      'Tap Add to install Say It.'
    ]
  }
};

export function getModuleInstallConfig ( key: ModuleInstallKey | string | null | undefined ): ModuleInstallConfig | null {
  if ( !key ) {
    return null;
  }

  const normalizedKey = String( key ).trim().toLowerCase() as ModuleInstallKey;
  return MODULE_INSTALL_CONFIGS[normalizedKey] || null;
}

export function getModuleInstallConfigForPath ( path: string | null | undefined ): ModuleInstallConfig | null {
  const normalizedPath = String( path || '' ).trim().toLowerCase();

  if ( normalizedPath.startsWith( '/docs/app' ) ) return MODULE_INSTALL_CONFIGS.docs;
  if ( normalizedPath.startsWith( '/pulse/app' ) ) return MODULE_INSTALL_CONFIGS.pulse;
  if ( normalizedPath.startsWith( '/moves/app' ) ) return MODULE_INSTALL_CONFIGS.moves;
  if ( normalizedPath.startsWith( '/network/app' ) ) return MODULE_INSTALL_CONFIGS.network;
  if ( normalizedPath.startsWith( '/outreach/app' ) ) return MODULE_INSTALL_CONFIGS.outreach;
  if ( normalizedPath.startsWith( '/say-it/app' ) ) return MODULE_INSTALL_CONFIGS['say-it'];
  if ( normalizedPath.startsWith( '/knowledge-base' ) ) return MODULE_INSTALL_CONFIGS.knowledge;

  return null;
}
