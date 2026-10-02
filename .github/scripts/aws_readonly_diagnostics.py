"""Read-only AWS checks through the existing deployment role.
Never output environment values, credentials, customer data or raw log messages.
"""
import json, re, subprocess, urllib.request, urllib.error

REGION='us-east-1'
API='koq91flf04'
report=[]
def aws(label,*args,project=None):
    p=subprocess.run(['aws',*args,'--region',REGION,'--output','json'],text=True,capture_output=True,timeout=40)
    if p.returncode:
        match=re.search(r'\(([^)]+)\) when calling',p.stderr)
        error=match.group(1) if match else 'AWS_REQUEST_FAILED'
        report.append({'check':label,'error':error})
        return None
    data=json.loads(p.stdout)
    if project:report.append({'check':label,'data':project(data)})
    return data

aws('api metadata','apigatewayv2','get-api','--api-id',API,project=lambda d:{k:d.get(k) for k in ['Name','ProtocolType','DisableExecuteApiEndpoint']})
integrations=aws('api integrations','apigatewayv2','get-integrations','--api-id',API,project=lambda d:[{k:r.get(k) for k in ['IntegrationId','IntegrationType','IntegrationMethod','IntegrationUri','PayloadFormatVersion','TimeoutInMillis','RequestParameters']} for r in d.get('Items',[])])
aws('api routes','apigatewayv2','get-routes','--api-id',API,project=lambda d:[{k:r.get(k) for k in ['RouteKey','Target','AuthorizationType']} for r in d.get('Items',[])])
aws('api stages','apigatewayv2','get-stages','--api-id',API,project=lambda d:[{'stage':r.get('StageName'),'autoDeploy':r.get('AutoDeploy'),'loggingConfigured':bool(r.get('AccessLogSettings'))} for r in d.get('Items',[])])

if integrations:
    for item in integrations.get('Items',[]):
        uri=item.get('IntegrationUri','')
        match=re.search(r':function:([a-zA-Z0-9_-]+)',uri)
        if not match:continue
        fn=match.group(1)
        aws('backend Lambda status','lambda','get-function-configuration','--function-name',fn,project=lambda d:{k:d.get(k) for k in ['FunctionName','Runtime','State','LastUpdateStatus','LastUpdateStatusReasonCode','MemorySize','Timeout']})
        logs=aws('backend error log access','logs','filter-log-events','--log-group-name','/aws/lambda/'+fn,'--filter-pattern','?ERROR ?Error ?Exception ?Traceback','--limit','20')
        if logs:
            # Classify only known failure signatures; do not print raw messages.
            patterns={'module_import':'Unable to import module|Runtime.ImportModuleError','database_connection':'OperationalError|connection refused|could not connect','missing_configuration':'KeyError|not configured|missing.*environment','permission_denied':'AccessDenied|not authorized','timeout':'Task timed out|TimeoutError','schema_missing':'UndefinedTable|does not exist','runtime_exception':'Traceback|Exception'}
            report.append({'check':'sanitized backend error signatures','eventCount':len(logs.get('events',[])),'signatures':{name:sum(bool(re.search(pattern,e.get('message',''),re.I)) for e in logs.get('events',[])) for name,pattern in patterns.items()}})

clusters=aws('ECS read access','ecs','list-clusters',project=lambda d:{'clusterCount':len(d.get('clusterArns',[]))})
if clusters:
    for cluster in clusters.get('clusterArns',[])[:5]:
        services=aws('ECS service read access','ecs','list-services','--cluster',cluster)
        if services and services.get('serviceArns'):
            aws('ECS service health','ecs','describe-services','--cluster',cluster,'--services',*services['serviceArns'][:10],project=lambda d:[{k:r.get(k) for k in ['serviceName','status','desiredCount','runningCount','pendingCount']} for r in d.get('services',[])])

for path in ['health','projects']:
    try:
        with urllib.request.urlopen(f'https://{API}.execute-api.{REGION}.amazonaws.com/api/v1/{path}',timeout=20) as response:status=response.status
    except urllib.error.HTTPError as exc:status=exc.code
    except Exception:status='NETWORK_FAILURE'
    report.append({'check':'public backend '+path,'status':status})
print('TWINERUN_AWS_DIAGNOSTICS='+json.dumps(report,separators=(',',':')))
if not integrations:
    raise SystemExit('The existing frontend role cannot inspect the backend integration. A backend read/deploy role or account-owner assistance is required; no permissions were expanded.')
