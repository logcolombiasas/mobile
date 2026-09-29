import { Amplify } from 'aws-amplify';
// Se genera con: npx ampx generate outputs --app-id <APP_ID> --branch main
// (ver README). Es el backend de Amplify del panel administrativo de SIA.
import outputs from '../../amplify_outputs.json';

Amplify.configure(outputs);
