import { Amplify } from 'aws-amplify';
// Se genera con: npx ampx generate outputs --app-id <APP_ID> --branch main
// (ver README). Es el mismo backend de Amplify del panel web de Logcolombia.
import outputs from '../../amplify_outputs.json';

Amplify.configure(outputs);
