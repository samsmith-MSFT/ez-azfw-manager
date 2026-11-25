const { contextBridge } = require('electron');

const SUBSCRIPTION = '11111111-1111-1111-1111-111111111111';
const POLICY_NAME = 'afwp-hub-production-global-network-security-policy';
const FIREWALL_NAME = 'azfw-hub-production-europe-primary-long-running-service';
const POLICY_ID = `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/firewallPolicies/${POLICY_NAME}`;
const FIREWALL_ID = `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/azureFirewalls/${FIREWALL_NAME}`;
const IP_GROUP_ID = `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/ipGroups/ipg-application-servers-production-europe-west`;
const NAMESPACE_ID = `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-observability-production/providers/Microsoft.EventHub/namespaces/ehns-firewall-production-euw`;
const STORAGE_ID = `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-shared-platform-storage/providers/Microsoft.Storage/storageAccounts/stsharedfirewalllogsprod`;

const account = {
  method: 'window',
  username: 'alexandra.network.operations@contoso.example',
  displayName: 'Alexandra Network Operations (Production)',
  tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  tenantsListed: true,
  tenants: [
    {
      tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      displayName: 'Contoso International Network Operations',
      defaultDomain: 'contosointernational.onmicrosoft.com',
      status: 'ready',
      subscriptionCount: 4,
    },
    {
      tenantId: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
      displayName: 'Contoso Development and Test',
      defaultDomain: 'contosodevelopment.onmicrosoft.com',
      status: 'ready',
      subscriptionCount: 2,
    },
  ],
};

const directoryAccount = {
  ...account,
  tenantId: undefined,
};

const firewalls = [
  {
    id: FIREWALL_ID,
    name: FIREWALL_NAME,
    subscriptionId: SUBSCRIPTION,
    subscriptionName:
      'Production Subscription – Global Network Security and Compliance',
    resourceGroup: 'rg-global-network-security-production-europe-west',
    location: 'westeurope',
    skuName: 'AZFW_VNet',
    skuTier: 'Premium',
    policyId: POLICY_ID,
    provisioningState: 'Succeeded',
    threatIntelMode: 'Deny',
    privateIp: '10.224.17.4',
    classicRuleCollectionCount: 0,
    tags: {
      environment: 'production',
      owner: 'network-platform-and-security-operations',
      criticality: 'tier-zero-global-connectivity',
    },
  },
  {
    id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/azureFirewalls/azfw-hub-disaster-recovery-secondary-region`,
    name: 'azfw-hub-disaster-recovery-secondary-region-with-long-display-name',
    subscriptionId: SUBSCRIPTION,
    subscriptionName:
      'Production Subscription – Global Network Security and Compliance',
    resourceGroup: 'rg-global-network-security-production-disaster-recovery',
    location: 'northeurope',
    skuName: 'AZFW_Hub',
    skuTier: 'Standard',
    policyId: `${POLICY_ID}-dr`,
    provisioningState: 'Succeeded',
    threatIntelMode: 'Alert',
    privateIp: '10.240.8.12',
    classicRuleCollectionCount: 0,
    tags: { environment: 'production-dr' },
  },
];

const networkRule = {
  name: 'allow-application-tier-to-central-sql-service-over-private-endpoint',
  description:
    'Production application servers may access the shared database cluster through its private endpoint.',
  ruleType: 'NetworkRule',
  ipProtocols: ['TCP'],
  sourceIpGroups: [IP_GROUP_ID],
  sourceAddresses: ['10.40.8.0/21'],
  destinationAddresses: ['10.96.12.40-10.96.12.47'],
  destinationPorts: ['1433', '1434-1444'],
};

const applicationRule = {
  name: 'allow-approved-package-repositories-and-vulnerability-feeds',
  description:
    'Build and security tooling may fetch signed artifacts from approved internal and external repositories.',
  ruleType: 'ApplicationRule',
  protocols: [
    { protocolType: 'Https', port: 443 },
    { protocolType: 'Http', port: 80 },
  ],
  sourceAddresses: ['10.40.0.0/16', '10.52.0.0/16'],
  targetFqdns: [
    '*.packages.contoso.example',
    'security-advisories.example.internal.contoso.example',
  ],
  fqdnTags: ['WindowsUpdate'],
  webCategories: ['ComputersAndTechnology'],
};

const groups = [
  {
    id: `${POLICY_ID}/ruleCollectionGroups/rcg-global-production-application-connectivity`,
    name: 'rcg-global-production-application-connectivity-and-egress-controls',
    priority: 300,
    provisioningState: 'Succeeded',
    ruleCollections: [
      {
        ruleCollectionType: 'FirewallPolicyFilterRuleCollection',
        name: 'rc-private-application-services-production-allowlist',
        priority: 1200,
        action: { type: 'Allow' },
        rules: [networkRule, applicationRule],
      },
      {
        ruleCollectionType: 'FirewallPolicyFilterRuleCollection',
        name: 'rc-default-production-deny-unsupported-egress-destinations',
        priority: 64000,
        action: { type: 'Deny' },
        rules: [
          {
            name: 'deny-unapproved-internet-destinations-from-sensitive-subnets',
            ruleType: 'NetworkRule',
            ipProtocols: ['Any'],
            sourceAddresses: ['10.40.0.0/16'],
            destinationAddresses: ['*'],
            destinationPorts: ['*'],
          },
        ],
      },
    ],
  },
];

const policyView = {
  policy: {
    id: POLICY_ID,
    name: POLICY_NAME,
    subscriptionId: SUBSCRIPTION,
    resourceGroup: 'rg-global-network-security-production-europe-west',
    location: 'westeurope',
    tier: 'Premium',
    threatIntelMode: 'Deny',
    provisioningState: 'Succeeded',
    firewallIds: [FIREWALL_ID],
    childPolicyIds: [],
    tags: { owner: 'network-platform-operations' },
  },
  groups: groups.map((group) => ({
    group,
    staged: false,
    drift: false,
  })),
};

const ipGroups = [
  {
    id: IP_GROUP_ID,
    name: 'ipg-application-servers-production-europe-west-and-dr',
    resourceGroup: 'rg-global-network-security-production-europe-west',
    subscriptionId: SUBSCRIPTION,
    subscriptionName:
      'Production Subscription – Global Network Security and Compliance',
    location: 'westeurope',
    addresses: [
      '10.40.8.0/21',
      '10.40.16.0/21',
      '10.52.8.0/21',
      '10.52.16.0/21',
    ],
    provisioningState: 'Succeeded',
    tags: { purpose: 'production-application-connectivity' },
  },
];

const firewallConfiguration = {
  name: FIREWALL_NAME,
  provisioningState: 'Succeeded',
  privateIp: '10.224.17.4',
  routeServerId: '',
  minCapacity: 4,
  maxCapacity: 20,
  powerState: 'Running',
  allocation: {
    skuName: 'AZFW_VNet',
    ipConfigurations: [
      {
        name: 'fw-primary',
        subnet: {
          id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/virtualNetworks/vnet-hub-production/subnets/AzureFirewallSubnet`,
        },
        publicIPAddress: {
          id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/publicIPAddresses/pip-firewall-primary-production`,
        },
      },
    ],
  },
};

const candidateStatus = {
  unsaved: true,
  pending: [
    {
      groupId: groups[0].id,
      groupName: groups[0].name,
      policyId: POLICY_ID,
      policyName: POLICY_NAME,
      stagedAt: '2026-11-23T10:00:00.000Z',
      changes: [
        {
          target: 'rule',
          kind: 'added',
          collection: groups[0].ruleCollections[0].name,
          rule: networkRule.name,
          detail:
            'TCP source 10.40.8.0/21 to 10.96.12.40-10.96.12.47 on ports 1433, 1434-1444',
        },
        {
          target: 'rule',
          kind: 'modified',
          collection: groups[0].ruleCollections[1].name,
          rule: 'deny-unapproved-internet-destinations-from-sensitive-subnets',
          detail: 'Destination addresses changed from 0.0.0.0/0 to *',
        },
      ],
      warnings: [
        'The changed rule allows traffic from a broad production application subnet range.',
      ],
    },
  ],
};

const history = [
  {
    id: 'commit-production-2026-11-22',
    time: '2026-11-22T15:42:17.000Z',
    user: 'Alexandra Network Operations (alexandra.network.operations@contoso.example)',
    description:
      'CHG0047821 – add the production application tier private database access exception after security review',
    changeCount: 2,
    results: [
      {
        groupId: groups[0].id,
        groupName: groups[0].name,
        policyName: POLICY_NAME,
        ok: true,
        action: 'update',
        changes: candidateStatus.pending[0].changes,
      },
    ],
  },
];

const storageConfig = {
  storageAccountId: STORAGE_ID,
  storageAccountName: 'stsharedfirewalllogsprod',
  subscriptionId: SUBSCRIPTION,
  resourceGroup: 'rg-shared-platform-storage',
  location: 'westeurope',
  skuName: 'Standard_GZRS',
  containerName: 'ez-azfw-production-policy-snapshots',
  historyContainerName: 'ez-azfw-production-commit-history',
};

const snapshots = [
  {
    id: 'snapshot-production-2026-11-22',
    policyId: POLICY_ID,
    policyName: POLICY_NAME,
    time: '2026-11-22T15:43:01.000Z',
    user: 'alexandra.network.operations@contoso.example',
    description:
      'Production policy before the approved database access exception was introduced.',
    groups,
    threatIntelMode: 'Deny',
  },
];

const subscriptions = [
  {
    subscriptionId: SUBSCRIPTION,
    name: 'Production Subscription – Global Network Security and Compliance',
  },
];

const deployContext = {
  subscriptionId: SUBSCRIPTION,
  network: { state: 'registered' },
  resourceGroups: [
    {
      name: 'rg-global-network-security-production-europe-west',
      location: 'westeurope',
    },
  ],
  vnets: [
    {
      id: `/subscriptions/${SUBSCRIPTION}/resourceGroups/rg-global-network-security-production/providers/Microsoft.Network/virtualNetworks/vnet-hub-production-europe-west`,
      name: 'vnet-hub-production-europe-west',
      resourceGroup: 'rg-global-network-security-production',
      location: 'westeurope',
      addressPrefixes: ['10.224.0.0/16'],
      subnets: [
        { name: 'AzureFirewallSubnet', prefix: '10.224.0.0/24' },
        {
          name: 'AzureFirewallManagementSubnet',
          prefix: '10.224.1.0/24',
        },
      ],
    },
  ],
  hubs: [],
  policies: [
    {
      id: POLICY_ID,
      name: POLICY_NAME,
      resourceGroup: 'rg-global-network-security-production',
      location: 'westeurope',
      tier: 'Premium',
    },
  ],
  locations: ['westeurope'],
  locationNames: { westeurope: 'West Europe – Netherlands' },
  locationZones: { westeurope: ['1', '2', '3'] },
};

const logSources = {
  namespaces: [
    {
      id: NAMESPACE_ID,
      name: 'ehns-firewall-production-euw',
      fqdn: 'ehns-firewall-production-euw.servicebus.windows.net',
      subscriptionId: SUBSCRIPTION,
      subscriptionName: subscriptions[0].name,
      resourceGroup: 'rg-observability-production',
      location: 'westeurope',
      skuTier: 'Standard',
      publicNetworkAccess: 'Enabled',
    },
  ],
  firewalls: firewalls.map((firewall) => ({
    firewallId: firewall.id,
    firewallName: firewall.name,
    location: firewall.location,
    skuTier: firewall.skuTier,
    settings:
      firewall.id === FIREWALL_ID
        ? [
            {
              name: 'send-structured-firewall-rule-logs-to-production-event-hub',
              eventHubNamespaceId: NAMESPACE_ID,
              eventHubName: 'firewall-production-rule-events',
              categories: [
                'AZFWNetworkRule',
                'AZFWApplicationRule',
                'AZFWNatRule',
              ],
              allLogs: false,
              logAnalytics: false,
              storage: false,
            },
          ]
        : [],
  })),
  dangling: [],
};

const logConfig = {
  namespace: 'ehns-firewall-production-euw.servicebus.windows.net',
  eventHub: 'firewall-production-rule-events',
  consumerGroup: 'ruleman-production',
  startPosition: 'latest',
};

const logStatus = {
  state: 'connected',
  detail: '4 of 4 partitions',
  error: '',
  hint: '',
  config: logConfig,
};

const logRows = [
  {
    id: 'layout-log-row-1',
    time: '2026-11-23T10:23:45.678Z',
    category: 'NetworkRule',
    protocol: 'TCP',
    sourceIp: '10.40.8.142',
    sourcePort: '52344',
    targetIp: '10.96.12.40',
    targetPort: '1433',
    action: 'Allow',
    policy: `${POLICY_NAME} » ${groups[0].name} » ${groups[0].ruleCollections[0].name} » ${networkRule.name}`,
    moreInfo: '',
    resourceId: FIREWALL_ID,
    fwPolicy: POLICY_NAME,
    ruleCollectionGroup: groups[0].name,
    ruleCollection: groups[0].ruleCollections[0].name,
    ruleName: networkRule.name,
    natDstIp: '',
    natDstPort: '',
    explicitProxy: '',
    tlsInspected: '',
  },
  {
    id: 'layout-log-row-2',
    time: '2026-11-23T10:23:46.789Z',
    category: 'AppRule',
    protocol: 'Https',
    sourceIp: '10.52.16.23',
    sourcePort: '61122',
    targetIp: 'security-advisories.example.internal.production.contoso.example',
    targetPort: '443',
    action: 'Deny',
    policy: `${POLICY_NAME} » ${groups[0].name} » Default Action`,
    moreInfo: 'Destination category was not present in the approved allowlist.',
    resourceId: FIREWALL_ID,
    fwPolicy: POLICY_NAME,
    ruleCollectionGroup: groups[0].name,
    ruleCollection: '',
    ruleName: '',
    natDstIp: '',
    natDstPort: '',
    explicitProxy: 'no',
    tlsInspected: 'yes',
  },
  {
    id: 'layout-log-row-3',
    time: '2026-11-23T10:23:47.890Z',
    category: 'NATRule',
    protocol: 'TCP',
    sourceIp: '198.51.100.214',
    sourcePort: '49152',
    targetIp: '10.40.12.15',
    targetPort: '8443',
    action: 'DNAT',
    policy: `${POLICY_NAME} » ingress-production-dnat-collection-group`,
    moreInfo: '',
    resourceId: FIREWALL_ID,
    fwPolicy: POLICY_NAME,
    ruleCollectionGroup: 'ingress-production-dnat-collection-group',
    ruleCollection: 'public-ingress-to-application-tier',
    ruleName: 'customer-api-production-ingress',
    natDstIp: '203.0.113.52',
    natDstPort: '443',
    explicitProxy: '',
    tlsInspected: '',
  },
];

const setupContext = {
  firewalls: logSources.firewalls.map((firewall) => ({
    firewall: {
      id: firewall.firewallId,
      name: firewall.firewallName,
      location: firewall.location,
      skuTier: firewall.skuTier,
    },
    state: {
      firewallId: firewall.firewallId,
      offeredCategories: [
        'AZFWNetworkRule',
        'AZFWApplicationRule',
        'AZFWNatRule',
        'AZFWThreatIntel',
        'AZFWIdpsSignature',
        'AZFWDnsQuery',
      ],
      existingSettings: [],
    },
  })),
  providers: [
    {
      subscriptionId: SUBSCRIPTION,
      namespace: 'Microsoft.Insights',
      registered: true,
    },
    {
      subscriptionId: SUBSCRIPTION,
      namespace: 'Microsoft.EventHub',
      registered: true,
    },
  ],
};

const ruleLookups = {
  ipGroups,
  serviceTags: [
    {
      name: 'Sql.WestEurope',
      region: 'westeurope',
      prefixCount: 48,
    },
  ],
  fqdnTags: ['WindowsUpdate'],
  webCategories: [
    { name: 'ComputersAndTechnology', group: 'InformationTechnology' },
  ],
  errors: [],
};

const params = new URLSearchParams(globalThis.location.search);
const scenarioMode = params.get('layoutScenario') ?? 'workspace';
const picker = scenarioMode === 'picker';
const formOnlyLogs = scenarioMode === 'log-form';

try {
  globalThis.localStorage.clear();
} catch {
  // Storage can be unavailable while the initial file URL is being initialized.
}

const resolved = (value) => Promise.resolve(value);
const event = () => {
  const listeners = new Set();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(value) {
      for (const listener of listeners) listener(value);
    },
  };
};
const updateProgress = event();
const commitProgress = event();
const deployProgress = event();
const logSetupProgress = event();

const api = {
  signIn: () => resolved(account),
  cancelSignIn: () => resolved(undefined),
  getAccount: () =>
    resolved(
      scenarioMode === 'signin'
        ? null
        : scenarioMode === 'directory'
          ? directoryAccount
          : account,
    ),
  restoreSession: () => resolved(null),
  signOut: () => resolved(undefined),
  switchTenant: () => resolved(account),
  discoverFirewalls: () => resolved(firewalls),
  discoverIpGroups: () => resolved(ipGroups),
  getIpGroupContext: () =>
    resolved({
      resourceGroups: deployContext.resourceGroups.map((group) => group.name),
      locations: [
        { name: 'westeurope', displayName: 'West Europe – Netherlands' },
      ],
    }),
  createIpGroup: (_request) => resolved(ipGroups[0]),
  getManagedFirewalls: () =>
    resolved(picker ? [] : [FIREWALL_ID, firewalls[1].id]),
  setManagedFirewalls: () => resolved(undefined),
  getPolicy: (policyId) =>
    resolved(
      policyId?.toLowerCase() === `${POLICY_ID}-dr`.toLowerCase()
        ? {
            ...policyView,
            policy: {
              ...policyView.policy,
              id: `${POLICY_ID}-dr`,
              name: 'afwp-hub-disaster-recovery-global-policy',
              firewallIds: [firewalls[1].id],
            },
          }
        : policyView,
    ),
  stageGroup: () => resolved(candidateStatus),
  stagePolicyMode: () => resolved(candidateStatus),
  getPolicySettings: () =>
    resolved({
      id: POLICY_ID,
      name: POLICY_NAME,
      tier: 'Premium',
      threatIntelMode: 'Deny',
      running: {
        dns: { inherit: true, enableProxy: true, servers: [] },
        allowlistIps: ['203.0.113.0/24'],
        allowlistFqdns: ['trusted-services.contoso.example'],
        autoLearnSnat: true,
        tls: {
          enabled: false,
          certificateName: '',
          secretId: '',
          identityIds: [],
        },
      },
      identities: [],
      errors: [],
    }),
  stagePolicySettings: () => resolved(candidateStatus),
  getFirewallSettings: () =>
    resolved({
      id: FIREWALL_ID,
      policyId: POLICY_ID,
      location: 'westeurope',
      tier: 'Premium',
      skuName: 'AZFW_VNet',
      provisioningState: 'Succeeded',
      running: firewallConfiguration,
      routeServers: [],
      maintenanceConfigurations: [],
      vnets: deployContext.vnets.map((vnet) => ({
        ...vnet,
        subnetId: `${vnet.id}/subnets/AzureFirewallSubnet`,
        managementSubnetId: `${vnet.id}/subnets/AzureFirewallManagementSubnet`,
      })),
      hubs: [],
      publicIps: [],
      errors: [],
    }),
  getFirewallConfiguration: () => resolved(firewallConfiguration),
  getLearnedPrefixes: () => resolved(['10.40.0.0/16', '10.52.0.0/16']),
  stageFirewallSettings: () => resolved(candidateStatus),
  stageFirewallPower: () => resolved(candidateStatus),
  createGroup: () => resolved(candidateStatus),
  importRulesCsv: () =>
    resolved({
      status: candidateStatus,
      groupIds: [groups[0].id],
      ruleCount: 2,
      skippedCount: 0,
    }),
  getRuleLookups: () => resolved(ruleLookups),
  refresh: () => resolved(undefined),
  getCandidateStatus: () => resolved(candidateStatus),
  revert: () => resolved({ pending: [], unsaved: false }),
  save: () => resolved(candidateStatus),
  commit: () => resolved(history[0]),
  resumeCommit: () => resolved(null),
  getHistory: () => resolved(history),
  getCentralHistory: () => resolved(history),
  getSnapshots: () => resolved(snapshots),
  restoreSnapshot: () => resolved(candidateStatus),
  getSnapshotStorageConfig: () => resolved(storageConfig),
  listSnapshotStorageAccounts: () =>
    resolved([
      {
        id: STORAGE_ID,
        name: storageConfig.storageAccountName,
        subscriptionId: SUBSCRIPTION,
        subscriptionName: subscriptions[0].name,
        resourceGroup: storageConfig.resourceGroup,
        location: storageConfig.location,
        skuName: storageConfig.skuName,
        kind: 'StorageV2',
        isGRS: true,
        isAppTagged: true,
        containerName: storageConfig.containerName,
        historyContainerName: storageConfig.historyContainerName,
      },
    ]),
  setSnapshotStorageAccount: () => resolved(storageConfig),
  createSnapshotStorageAccount: () =>
    resolved({ ...storageConfig, roleAssigned: true }),
  openInPortal: () => resolved(undefined),
  openFirewallDeploymentGuide: () => resolved(undefined),
  saveCsv: () => resolved('/tmp/layout-export.csv'),
  checkForUpdate: () => resolved({ available: false, version: '1.6.2' }),
  installUpdate: () => resolved({ phase: 'idle', message: 'Mocked' }),
  openReleasePage: () => resolved(undefined),
  onUpdateProgress: updateProgress.subscribe,
  onCommitProgress: commitProgress.subscribe,
  listSubscriptions: () => resolved(subscriptions),
  getDeployContext: () => resolved(deployContext),
  deployFirewall: () =>
    resolved({
      firewallName: FIREWALL_NAME,
      phase: 'succeeded',
      message: 'Deployment completed in the layout mock.',
      startedAt: '2026-11-23T10:00:00.000Z',
      operations: [],
    }),
  registerNetworkProvider: () => resolved({ state: 'registered' }),
  onDeployProgress: deployProgress.subscribe,
  getLogStreamConfig: () => resolved(formOnlyLogs ? null : logConfig),
  getLogStreamStatus: () =>
    resolved(
      formOnlyLogs
        ? { state: 'idle', detail: '', error: '', hint: '' }
        : logStatus,
    ),
  startLogStream: () => resolved(logStatus),
  stopLogStream: () => resolved(undefined),
  discoverLogSources: () => resolved(logSources),
  listEventHubs: () =>
    resolved([
      {
        name: 'firewall-production-rule-events',
        partitionCount: 4,
        retentionHours: 168,
      },
    ]),
  listConsumerGroups: () => resolved(['$Default', 'ruleman-production']),
  grantLogReceiver: () =>
    resolved(`${NAMESPACE_ID}/eventhubs/firewall-production-rule-events`),
  reviewLogCleanup: () =>
    resolved({ namespaceDeleted: false, changes: [], hash: 'layout-mock' }),
  applyLogCleanup: () => resolved({ action: 'trim' }),
  listLogResourceGroups: () => resolved(deployContext.resourceGroups),
  getLogSetupContext: () => resolved(setupContext),
  checkEventHubNamespaceName: () => resolved({ available: true }),
  reviewLogSetup: () =>
    resolved({
      errors: [],
      warnings: [],
      lines: [
        'Create the production Event Hub and send-only authorization rule.',
        'Enable structured Network, Application and NAT rule logs for the selected firewalls.',
      ],
      permissions: [
        { what: 'Event Hub namespace and hub', permission: 'Contributor' },
        {
          what: 'Firewall diagnostic settings',
          permission: 'Monitoring Contributor',
        },
      ],
      cost: 'about $22 per month plus event charges',
      hash: 'layout-log-setup-review',
      labels: ['Create Event Hub', 'Configure diagnostic settings'],
    }),
  applyLogSetup: () =>
    resolved({
      phase: 'succeeded',
      steps: [],
      connect: logConfig,
      manual: [],
    }),
  onLogSetupProgress: logSetupProgress.subscribe,
  onLogBatch(listener) {
    queueMicrotask(() => listener({ rows: logRows, skipped: 0 }));
    return () => {};
  },
  onLogStreamStatus(listener) {
    queueMicrotask(() => listener(logStatus));
    return () => {};
  },
};

contextBridge.exposeInMainWorld('api', api);
