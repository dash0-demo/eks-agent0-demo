# EKS + Dash0 operator + Agent0 demo

An Amazon EKS cluster defined with [EKS Blueprints for CDK](https://github.com/awslabs/cdk-eks-blueprints). The
[Dash0 operator](https://dash0.com/docs/dash0/monitoring/kubernetes/dash0-operator/overview) is installed as a CDK
add-on when the cluster is created, with the [Agent0 Kubernetes integration](https://dash0.com/docs/dash0/monitoring/kubernetes/dash0-operator/agent0-integration)
(beta) switched on.

```ts
EksBlueprint.builder()
  .addOns(
    new Dash0OperatorAddOn({ ingressEndpoint, apiEndpoint, token, agent0Connector: { serverAddress } }),
  )
  .build(app, 'eks-agent0-demo');
```

The add-on is in [`cdk/lib/dash0-operator-addon.ts`](cdk/lib/dash0-operator-addon.ts). Copy it into your own blueprint.

## What runs in the cluster

- `storefront` serves product pages and calls `inventory` for stock levels.
- `inventory` keeps a cache of stock reports in memory.
- `loadgen` sends two requests per second to `storefront`.
- Argo CD keeps everything in [`k8s/`](k8s) synced from this repository.

The Dash0 operator auto-instruments both Node.js services, so Dash0 shows the `storefront → inventory` dependency.

## The planted problem

`k8s/inventory/deployment.yaml` sets `CACHE_SIZE_MB=512`, but the container's memory limit is `128Mi`. As the cache
fills, `inventory` is OOMKilled, restarts, and `storefront` starts failing. Ask Agent0 why.

## Deploy

Prerequisites: AWS credentials (the cluster goes to `eu-west-2` by default, change it with `-c region=...`), Node.js 22+, a [CDK-bootstrapped](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html) account and region.

1. Create a Dash0 auth token and store it in AWS Secrets Manager:

   ```sh
   aws secretsmanager create-secret --region eu-west-2 \
     --name dash0/eks-agent0-demo --secret-string '{"token":"auth_..."}'
   ```

2. Deploy (about 20 minutes). The endpoints default to Dash0's `eu-west-1` region; copy yours from
   **Settings → Endpoints** and pass them as context if they differ:

   ```sh
   cd cdk && npm ci
   npx cdk deploy \
     -c dash0Ingress=ingress.eu-west-1.aws.dash0.com:4317 \
     -c dash0Api=https://api.eu-west-1.aws.dash0.com \
     -c dash0OutboundConnector=outbound-connector.eu-west-1.aws.dash0.com:443
   ```

3. Clean up: `npx cdk destroy`, then delete the secret.
