import Action from 'd2-ui/lib/action/Action';
import detailsStore from './details.store';
import { config, getInstance as getD2 } from 'd2/lib/d2';
import orgUnitAssignmentDialogStore from './organisation-unit-dialog/organisationUnitDialogStore';

config.i18n.strings.add('details');
config.i18n.strings.add('assignToOrgUnits');

const contextActions = Action.createActionsFromNames([
    'details',
    'assignToOrgUnits'
]);

contextActions.details
    .subscribe(({ data: model }) => {
        detailsStore.setState(model);
    });
    
contextActions.assignToOrgUnits
    .subscribe(async({ data: model }) => {
        const d2 = await getD2();
        const modelItem = await d2.models[model.modelDefinition.name].get(model.id);
        const rootOrgUnit = await d2.models.organisationUnits.list({
            paging: false,
            level: 1,
            fields: 'id,displayName,children[id,displayName,children::isNotEmpty]',
        }).then(rootLevel => rootLevel.toArray()[0]);

        orgUnitAssignmentDialogStore.setState({
            model: modelItem,
            root: rootOrgUnit,
            open: true,
        });
    });

export default contextActions;
