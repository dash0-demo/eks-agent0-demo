#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as eks from 'aws-cdk-lib/aws-eks';
import * as blueprints from '@aws-quickstart/eks-blueprints';
import { Dash0OperatorAddOn } from '../lib/dash0-operator-addon';
import { GitOpsAppAddOn } from '../lib/gitops-app-addon';

blueprints.utils.logger.settings.minLevel = 3; // hide debug output
const app = new cdk.App();
const ctx = (key: string, fallback: string) => app.node.tryGetContext(key) ?? fallback;

const region = ctx('region', 'eu-west-2');
const dash0Region = ctx('dash0Region', 'eu-west-1');
// Secrets Manager secret holding {"token": "auth_..."}: a Dash0 auth token for your organization.
const dash0Token = cdk.SecretValue.secretsManager(ctx('dash0TokenSecret', 'dash0/eks-agent0-demo'), {
  jsonField: 'token',
}).unsafeUnwrap();

blueprints.EksBlueprint.builder()
  .account(process.env.CDK_DEFAULT_ACCOUNT)
  .region(region)
  .version(eks.KubernetesVersion.V1_35)
  .clusterProvider(
    new blueprints.MngClusterProvider({
      version: eks.KubernetesVersion.V1_35,
      // Deliberately small: two nodes for the whole demo.
      instanceTypes: [new ec2.InstanceType('t3.large')],
      minSize: 2,
      desiredSize: 2,
      maxSize: 2,
    }),
  )
  .addOns(
    new blueprints.addons.VpcCniAddOn(),
    new blueprints.addons.CoreDnsAddOn(),
    new blueprints.addons.KubeProxyAddOn(),
    new blueprints.addons.ArgoCDAddOn(),
    // The Dash0 operator, installed as an add-on when the cluster is created.
    new Dash0OperatorAddOn({
      ingressEndpoint: ctx('dash0Ingress', `ingress.${dash0Region}.aws.dash0.com:4317`),
      apiEndpoint: ctx('dash0Api', `https://api.${dash0Region}.aws.dash0.com`),
      token: dash0Token,
      clusterName: 'eks-agent0-demo',
      agent0Connector: {
        serverAddress: ctx('dash0OutboundConnector', `outbound-connector.${dash0Region}.aws.dash0.com:443`),
      },
    }),
    // Argo CD keeps the shop app in k8s/ synced from GitHub.
    new GitOpsAppAddOn({
      name: 'shop',
      repoUrl: ctx('repoUrl', 'https://github.com/dash0-demo/eks-agent0-demo.git'),
      path: 'k8s',
      namespace: 'shop',
    }),
  )
  .build(app, 'eks-agent0-demo');
