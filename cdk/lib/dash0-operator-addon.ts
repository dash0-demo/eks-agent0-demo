import { Construct } from 'constructs';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { merge } from 'ts-deepmerge';

/**
 * EKS Blueprints add-on that installs the Dash0 operator (Helm chart) when the cluster is created,
 * optionally with the Agent0 connector so Agent0 can run read-only kubectl in the cluster.
 *
 * Tokens are passed as strings. Use a Secrets Manager dynamic reference
 * (SecretValue.secretsManager(...).unsafeUnwrap()) so the value is resolved by CloudFormation
 * at deploy time and never stored in the synthesized template.
 */
export interface Dash0OperatorAddOnProps extends blueprints.HelmAddOnUserProps {
  /** OTLP/gRPC ingress endpoint, e.g. ingress.eu-west-1.aws.dash0.com:4317 */
  ingressEndpoint: string;
  /** Dash0 API endpoint, e.g. https://api.eu-west-1.aws.dash0.com */
  apiEndpoint: string;
  /** Dash0 auth token used for exporting telemetry. */
  token: string;
  /** Dash0 dataset to send telemetry to. Defaults to "default". */
  dataset?: string;
  /** Name shown for this cluster in Dash0. Defaults to the EKS cluster name. */
  clusterName?: string;
  /** Agent0 connector (beta). Omit to install the operator without it. */
  agent0Connector?: {
    /** "Outbound Connector" endpoint, e.g. outbound-connector.eu-west-1.aws.dash0.com:443 */
    serverAddress: string;
    /** Auth token for the connector. Defaults to the export token. */
    token?: string;
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

export class Dash0OperatorAddOn extends blueprints.HelmAddOn {
  private readonly options: Dash0OperatorAddOnProps;

  constructor(props: Dash0OperatorAddOnProps) {
    super({ ...defaults, ...props });
    this.options = props;
  }

  deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const o = this.options;
    const operator: Record<string, unknown> = {
      clusterName: o.clusterName ?? clusterInfo.cluster.clusterName,
      dash0Export: {
        enabled: true,
        endpoint: o.ingressEndpoint,
        apiEndpoint: o.apiEndpoint,
        token: o.token,
        dataset: o.dataset ?? 'default',
      },
    };
    if (o.agent0Connector) {
      operator.agent0Connector = {
        enabled: true,
        serverAddress: o.agent0Connector.serverAddress,
        token: o.agent0Connector.token ?? o.token,
      };
    }
    const values = merge({ operator }, o.values ?? {});
    const chart = this.addHelmChart(clusterInfo, values, true, true);
    return Promise.resolve(chart);
  }
}
