import { Construct } from 'constructs';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { merge } from 'ts-deepmerge';

/**
 * EKS Blueprints add-on that installs the Dash0 operator (Helm chart) when the cluster is created,
 * optionally with the Agent0 connector so Agent0 can run read-only kubectl in the cluster.
 *
 * The Dash0 auth token stays in AWS Secrets Manager. External Secrets (ExternalsSecretsAddOn, which
 * this add-on depends on) copies it into a Kubernetes secret, and the operator reads it from there,
 * so the token never appears in code or in the CloudFormation template.
 */
export interface Dash0OperatorAddOnProps extends blueprints.HelmAddOnUserProps {
  /** OTLP/gRPC ingress endpoint, e.g. ingress.eu-west-1.aws.dash0.com:4317 */
  ingressEndpoint: string;
  /** Dash0 API endpoint, e.g. https://api.eu-west-1.aws.dash0.com */
  apiEndpoint: string;
  /**
   * Name of an AWS Secrets Manager secret in the cluster's region holding {"token": "auth_..."}.
   */
  tokenSecretName: string;
  /** Dash0 dataset to send telemetry to. Defaults to "default". */
  dataset?: string;
  /** Name shown for this cluster in Dash0. Defaults to the EKS cluster name. */
  clusterName?: string;
  /** Agent0 connector (beta). Omit to install the operator without it. */
  agent0Connector?: {
    /** "Outbound Connector" endpoint, e.g. outbound-connector.eu-west-1.aws.dash0.com:443 */
    serverAddress: string;
  };
}

const defaults: blueprints.HelmAddOnProps = {
  name: 'dash0-operator',
  chart: 'dash0-operator',
  repository: 'https://dash0hq.github.io/dash0-operator',
  version: '0.162.0',
  release: 'dash0-operator',
  namespace: 'dash0-system',
};

const K8S_SECRET = 'dash0-authorization-secret';

export class Dash0OperatorAddOn extends blueprints.HelmAddOn {
  private readonly options: Dash0OperatorAddOnProps;

  constructor(props: Dash0OperatorAddOnProps) {
    super({ ...defaults, ...props });
    this.options = props;
  }

  async deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const o = this.options;
    const cluster = clusterInfo.cluster;
    const namespace = this.props.namespace!;

    // External Secrets must be installed (CRDs and webhook ready) before anything below.
    const externalSecrets = await clusterInfo.getScheduledAddOn(blueprints.addons.ExternalsSecretsAddOn.name);
    if (!externalSecrets) throw new Error('Dash0OperatorAddOn needs ExternalsSecretsAddOn in the same blueprint.');

    // Namespace, plus an ExternalSecret that syncs the token from Secrets Manager.
    const ns = blueprints.utils.createNamespace(namespace, cluster, true);
    ns.node.addDependency(externalSecrets);
    const store = cluster.addManifest('dash0-secret-store', {
      apiVersion: 'external-secrets.io/v1',
      kind: 'ClusterSecretStore',
      metadata: { name: 'dash0-aws-secrets-manager' },
      spec: {
        provider: {
          aws: {
            service: 'SecretsManager',
            region: clusterInfo.cluster.stack.region,
            auth: { jwt: { serviceAccountRef: { name: 'external-secrets-sa', namespace: 'external-secrets' } } },
          },
        },
      },
    });
    store.node.addDependency(ns);
    const externalSecret = cluster.addManifest('dash0-external-secret', {
      apiVersion: 'external-secrets.io/v1',
      kind: 'ExternalSecret',
      metadata: { name: K8S_SECRET, namespace },
      spec: {
        refreshInterval: '1h',
        secretStoreRef: { name: 'dash0-aws-secrets-manager', kind: 'ClusterSecretStore' },
        target: { name: K8S_SECRET },
        data: [{ secretKey: 'token', remoteRef: { key: o.tokenSecretName, property: 'token' } }],
      },
    });
    externalSecret.node.addDependency(store);

    const secretRef = { name: K8S_SECRET, key: 'token' };
    const operator: Record<string, unknown> = {
      clusterName: o.clusterName ?? cluster.clusterName,
      dash0Export: {
        enabled: true,
        endpoint: o.ingressEndpoint,
        apiEndpoint: o.apiEndpoint,
        secretRef,
        dataset: o.dataset ?? 'default',
      },
    };
    if (o.agent0Connector) {
      operator.agent0Connector = { enabled: true, serverAddress: o.agent0Connector.serverAddress, secretRef };
    }
    const values = merge({ operator }, o.values ?? {});
    const chart = this.addHelmChart(clusterInfo, values, true, true);
    chart.node.addDependency(externalSecret);
    return chart;
  }
}
