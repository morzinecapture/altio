jest.mock('react-native',()=>({Alert:{alert:jest.fn()}}));
import {Alert} from 'react-native';
import {confirmEarlyExecution} from '../early-execution-consent';
let alert:jest.SpyInstance;
beforeEach(()=>{alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{})});afterEach(()=>alert.mockRestore());
test('requires two separate explicit choices before returning consent',async()=>{let resolved=false;const result=confirmEarlyExecution().then(x=>{resolved=true;return x});expect(resolved).toBe(false);alert.mock.calls[0][2][1].onPress();expect(alert).toHaveBeenCalledTimes(2);expect(resolved).toBe(false);alert.mock.calls[1][2][1].onPress();await expect(result).resolves.toEqual({version:'2026-10-09-v1',requested:true,acknowledged:true})});
test('cancelling either stage never returns consent',async()=>{const result=confirmEarlyExecution();const assertion=expect(result).rejects.toThrow('non autorisé');alert.mock.calls[0][2][0].onPress();await assertion;});
